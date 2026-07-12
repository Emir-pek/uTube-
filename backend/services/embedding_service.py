import numpy as np
import threading
import logging

logger = logging.getLogger(__name__)

# To prevent hanging app startup or redundant loads, 
# we load the model lazily (singleton pattern) the first time it is needed.
_model = None
_model_lock = threading.Lock()

def get_sentence_transformer():
    """Returns the globally loaded sentence-transformer model."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                try:
                    logger.info("Loading sentence-transformers 'all-MiniLM-L6-v2' local model...")
                    from sentence_transformers import SentenceTransformer
                    _model = SentenceTransformer('all-MiniLM-L6-v2')
                    logger.info("Successfully loaded sentence-transformers model!")
                except (ImportError, Exception) as e:
                    logger.info(f"Embedding service not available: {e}. Lexical search fallback is active.")
                    _model = "UNAVAILABLE"
    if _model == "UNAVAILABLE":
        return None
    return _model

def generate_embedding(text: str) -> list[float]:
    """
    Generates a dense vector embedding for the given text using the local model.
    Returns the vector as a list of floats so it can be stored as JSON.
    """
    if not text or not text.strip():
        return [0.0] * 384

    model = get_sentence_transformer()
    if not model:
        return None # Gracious failure
    
    # The encode function returns a numpy array, we convert it to a python list
    embedding_array = model.encode(text, convert_to_numpy=True)
    return embedding_array.tolist()

def compute_cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """
    Computes semantic similarity (-1 to 1) between two vectors entirely locally using numpy.
    A score of 1 means exactly the same meaning.
    """
    if not vec1 or not vec2:
        return 0.0
    
    a = np.array(vec1)
    b = np.array(vec2)
    
    # Cosine Similarity Formula: (A dot B) / (||A|| * ||B||)
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
        
    return float(dot_product / (norm_a * norm_b))
