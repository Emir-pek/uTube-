"""
Professional Database Seeder
-----------------------------
Generates synthetic test data for the uTube platform.

Creates:
- 20 synthetic users
- 50 synthetic videos across 5 categories
- 200 like interactions
- 100 comment interactions

Usage:
    python -m backend.database.seeder
"""

import sys
import os
from pathlib import Path
import random
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.database.connection import SessionLocal, init_db
from backend.database.models import User, Video, Like, Comment
from backend.core.security import hash_password


# ============================================================================
# Sample Data
# ============================================================================

CATEGORIES = ["Tech", "Music", "Gaming", "Education", "Cinema"]

FIRST_NAMES = [
    "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn",
    "Skyler", "Dakota", "Peyton", "Cameron", "Sage", "River", "Phoenix",
    "Rowan", "Finley", "Kai", "Reese", "Blake"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"
]

VIDEO_TITLES = {
    "Tech": [
        "Python Tutorial for Beginners",
        "Web Development Crash Course",
        "Machine Learning Basics",
        "React.js Full Course",
        "Docker Container Guide",
        "API Design Best Practices",
        "Database Optimization Tips",
        "Cloud Computing Explained",
        "Cybersecurity Fundamentals",
        "Git and GitHub Workflow"
    ],
    "Music": [
        "Guitar Lessons for Beginners",
        "Music Theory Explained",
        "Piano Chord Progressions",
        "Beat Making Tutorial",
        "Vocal Training Exercises",
        "Jazz Improvisation Guide",
        "Electronic Music Production",
        "Songwriting Tips",
        "Mixing and Mastering",
        "Classical Music Analysis"
    ],
    "Gaming": [
        "Game Development Tutorial",
        "Speedrun Strategies",
        "Pro Gaming Tips",
        "Game Design Principles",
        "Unity 3D Basics",
        "Esports Tournament Highlights",
        "Retro Gaming Review",
        "Game Streaming Setup",
        "Level Design Masterclass",
        "Gaming PC Build Guide"
    ],
    "Education": [
        "Mathematics Made Easy",
        "Physics Experiments",
        "History Documentary",
        "Biology Basics",
        "Chemistry Lab Techniques",
        "Study Skills Workshop",
        "Language Learning Tips",
        "Critical Thinking Course",
        "Science Fair Projects",
        "Academic Writing Guide"
    ],
    "Cinema": [
        "Film Making Basics",
        "Cinematography Techniques",
        "Screenplay Writing Guide",
        "Video Editing Tutorial",
        "Movie Review Analysis",
        "Acting Workshop",
        "Film History Overview",
        "Color Grading Masterclass",
        "Sound Design for Film",
        "Documentary Filmmaking"
    ]
}

DESCRIPTIONS = [
    "Learn the fundamentals in this comprehensive guide.",
    "A complete tutorial covering everything you need to know.",
    "Master the essentials with step-by-step instructions.",
    "Discover advanced techniques and best practices.",
    "Perfect for beginners and intermediate learners.",
    "In-depth exploration of key concepts.",
    "Practical examples and real-world applications.",
    "Expert tips and tricks revealed.",
    "Transform your skills with this detailed course.",
    "Everything you need to get started today."
]

COMMENTS = [
    "Great video! Very helpful.",
    "Thanks for sharing this!",
    "Exactly what I was looking for.",
    "Clear and concise explanation.",
    "This helped me so much!",
    "Amazing content, keep it up!",
    "Well explained, thank you!",
    "I learned a lot from this.",
    "Perfect tutorial for beginners.",
    "Subscribed! Can't wait for more.",
    "This is gold, thank you!",
    "Best explanation I've found.",
    "Super useful information.",
    "You made this so easy to understand.",
    "Fantastic work!",
    "This deserves more views.",
    "Bookmarked for future reference.",
    "Incredible quality content.",
    "This changed my perspective.",
    "Thank you for making this!"
]

# Sample video URLs from Pexels (free stock videos)
SAMPLE_VIDEO_URLS = [
    "pexels-sample-tech-1.mp4",
    "pexels-sample-music-2.mp4",
    "pexels-sample-gaming-3.mp4",
    "pexels-sample-education-4.mp4",
    "pexels-sample-cinema-5.mp4"
]


# ============================================================================
# Seeder Functions
# ============================================================================

def create_synthetic_users(db, count=20):
    """Create synthetic users."""
    print(f"Creating {count} synthetic users...")
    users = []
    
    for i in range(count):
        first_name = random.choice(FIRST_NAMES)
        last_name = random.choice(LAST_NAMES)
        username = f"{first_name.lower()}{last_name.lower()}{i}"
        email = f"{username}@example.com"
        
        user = User(
            username=username,
            email=email,
            password_hash=hash_password("TestPass123"),
            profile_image=None,
            is_synthetic=1,  # Mark as synthetic
            created_at=datetime.utcnow() - timedelta(days=random.randint(1, 365))
        )
        
        db.add(user)
        users.append(user)
    
    db.commit()
    print(f"✓ Created {count} users")
    return users


def create_synthetic_videos(db, users, count=50):
    """Create synthetic videos across categories."""
    print(f"Creating {count} synthetic videos...")
    videos = []
    
    for i in range(count):
        category = random.choice(CATEGORIES)
        title = random.choice(VIDEO_TITLES[category])
        description = random.choice(DESCRIPTIONS)
        author = random.choice(users)
        
        # Generate random view count (weighted towards lower values)
        view_count = int(random.expovariate(1/500))
        
        video = Video(
            title=f"{title} #{i+1}",
            description=description,
            category=category,
            tags=f"{category.lower()}, tutorial, learning",
            video_filename=f"synthetic_video_{i+1}.mp4",
            thumbnail_filename=f"synthetic_thumb_{i+1}.jpg",
            duration=random.randint(180, 3600),  # 3 min to 1 hour
            view_count=view_count,
            user_id=author.id,
            upload_date=datetime.utcnow() - timedelta(days=random.randint(1, 180))
        )
        
        db.add(video)
        videos.append(video)
    
    db.commit()
    print(f"✓ Created {count} videos")
    return videos


def create_synthetic_likes(db, users, videos, count=200):
    """Create synthetic like interactions."""
    print(f"Creating {count} synthetic likes...")
    likes_created = 0
    
    # Create a set to track unique user-video pairs
    existing_pairs = set()
    
    while likes_created < count:
        user = random.choice(users)
        video = random.choice(videos)
        
        # Don't like own videos
        if video.user_id == user.id:
            continue
        
        # Check if this pair already exists
        pair = (user.id, video.id)
        if pair in existing_pairs:
            continue
        
        like = Like(
            user_id=user.id,
            video_id=video.id,
            created_at=datetime.utcnow() - timedelta(days=random.randint(1, 90))
        )
        
        db.add(like)
        existing_pairs.add(pair)
        likes_created += 1
    
    db.commit()
    print(f"✓ Created {count} likes")


def create_synthetic_comments(db, users, videos, count=100):
    """Create synthetic comment interactions."""
    print(f"Creating {count} synthetic comments...")
    
    for i in range(count):
        user = random.choice(users)
        video = random.choice(videos)
        text = random.choice(COMMENTS)
        
        comment = Comment(
            text=text,
            user_id=user.id,
            video_id=video.id,
            created_at=datetime.utcnow() - timedelta(days=random.randint(1, 90))
        )
        
        db.add(comment)
    
    db.commit()
    print(f"✓ Created {count} comments")


def seed_database():
    """Main seeder function."""
    print("\n" + "="*60)
    print("🌱 Professional Database Seeder")
    print("="*60 + "\n")
    
    # Initialize database
    print("Initializing database...")
    init_db()
    
    # Create session
    db = SessionLocal()
    
    try:
        # Create synthetic data
        users = create_synthetic_users(db, count=20)
        videos = create_synthetic_videos(db, users, count=50)
        create_synthetic_likes(db, users, videos, count=200)
        create_synthetic_comments(db, users, videos, count=100)
        
        # Summary
        print("\n" + "="*60)
        print("✅ Seeding Complete!")
        print("="*60)
        print("  Users:    20 synthetic users created")
        print("  Videos:   50 videos across 5 categories")
        print("  Likes:    200 like interactions")
        print("  Comments: 100 comment interactions")
        print("="*60 + "\n")
        
        print("📊 Category Distribution:")
        for category in CATEGORIES:
            count = db.query(Video).filter(Video.category == category).count()
            print(f"  {category:12} {count} videos")
        
        print("\n💡 To remove synthetic data later, run:")
        print("   DELETE FROM users WHERE is_synthetic = 1;")
        print("\n")
        
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def clear_synthetic_data():
    """Remove all synthetic data from database."""
    print("\n🧹 Clearing synthetic data...")
    db = SessionLocal()
    
    try:
        # Delete synthetic users (cascade will delete related data)
        deleted = db.query(User).filter(User.is_synthetic == 1).delete()
        db.commit()
        print(f"✓ Removed {deleted} synthetic users and all related data")
    except Exception as e:
        print(f"❌ Error clearing data: {e}")
        db.rollback()
    finally:
        db.close()


# ============================================================================
# CLI Interface
# ============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="uTube Database Seeder")
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear all synthetic data"
    )
    
    args = parser.parse_args()
    
    if args.clear:
        clear_synthetic_data()
    else:
        seed_database()
