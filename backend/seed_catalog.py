"""
Seed the BGU course catalog into Supabase.
Run: python seed_catalog.py
"""
import json
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from services.supabase_client import get_client

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


def seed():
    db = get_client()

    # Load all catalog seed files
    seed_files = [
        os.path.join(DATA_DIR, f)
        for f in os.listdir(DATA_DIR)
        if f.endswith("_seed.json") or f == "bgu_catalog_seed.json"
    ]

    all_departments = []
    all_tracks = []
    all_courses = []

    for filepath in seed_files:
        print(f"Loading {filepath}...")
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        all_departments.extend(data.get("departments", []))
        all_tracks.extend(data.get("tracks", []))
        all_courses.extend(data.get("courses", []))

    # Also load CS shnaton if available
    cs_path = os.path.join(DATA_DIR, "cs_shnaton_parsed.json")
    if os.path.exists(cs_path):
        print(f"Loading {cs_path}...")
        with open(cs_path, "r", encoding="utf-8") as f:
            cs_data = json.load(f)
        if "departments" not in cs_data:
            # Add CS department if not present
            pass
        all_tracks.extend(cs_data.get("tracks", []))
        all_courses.extend(cs_data.get("courses", []))

    print(f"\nTotal: {len(all_departments)} departments, {len(all_tracks)} tracks, {len(all_courses)} courses")

    # Seed departments
    for dept in all_departments:
        row = {
            "id": dept["id"],
            "name": dept.get("name_he", dept.get("name", "")),
            "faculty": dept.get("faculty", ""),
            "program_code": dept.get("program_code", ""),
        }
        try:
            db.table("bgu_departments").upsert(row, on_conflict="id").execute()
            print(f"  dept: {row['name']}")
        except Exception as e:
            print(f"  dept ERROR: {e}")

    # Seed tracks
    for track in all_tracks:
        row = {
            "id": track["id"],
            "name": track.get("name", ""),
            "departments": track.get("departments", []),
            "total_credits": track.get("total_credits", 0),
            "type": track.get("type", "single"),
            "details": json.dumps({
                k: v for k, v in track.items()
                if k not in ("id", "name", "departments", "total_credits", "type")
            }),
        }
        try:
            db.table("bgu_tracks").upsert(row, on_conflict="id").execute()
            print(f"  track: {row['name']} ({row['total_credits']} credits)")
        except Exception as e:
            print(f"  track ERROR: {e}")

    # Seed courses
    seen = set()
    for course in all_courses:
        cid = course.get("course_id", "")
        if not cid or cid in seen:
            continue
        seen.add(cid)

        row = {
            "course_id": cid,
            "name": course.get("name_he", course.get("name", "")),
            "name_en": course.get("name_en", course.get("name", "")),
            "credits": course.get("credits", 0),
            "department": course.get("department", ""),
            "year": course.get("year"),
            "semester": course.get("semester", ""),
            "type": course.get("type", "elective"),
            "tracks": course.get("tracks", []),
            "prerequisites": course.get("prerequisites", []),
            "category": course.get("category", ""),
        }
        try:
            db.table("bgu_course_catalog").upsert(row, on_conflict="course_id").execute()
        except Exception as e:
            print(f"  course ERROR [{cid}]: {e}")

    print(f"\nSeeded {len(seen)} unique courses to bgu_course_catalog")
    print("Done!")


if __name__ == "__main__":
    seed()
