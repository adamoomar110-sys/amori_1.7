import json
import os

LIBRARY_FILE = "library.json"

def deduplicate():
    if not os.path.exists(LIBRARY_FILE):
        print("Library file not found.")
        return

    with open(LIBRARY_FILE, "r", encoding="utf-8") as f:
        library = json.load(f)

    seen_filenames = set()
    unique_library = []
    
    print(f"Original count: {len(library)}")

    for book in library:
        filename = book.get("filename")
        if filename and filename not in seen_filenames:
            unique_library.append(book)
            seen_filenames.add(filename)
        else:
            print(f"Removing duplicate: {filename} ({book.get('doc_id')})")

    print(f"New count: {len(unique_library)}")

    with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
        json.dump(unique_library, f, indent=4)
        
    print("Library deduplicated.")

if __name__ == "__main__":
    deduplicate()
