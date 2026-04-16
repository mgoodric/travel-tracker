#!/bin/bash
# Extract geotagged photos from Apple Photos for travel-tracker import.
# Filters to known family camera models to exclude photos received from others.
# Uses Apple Photos face recognition to tag all family members present.
#
# Requires: pipx install osxphotos
#
# Usage:
#   bash scripts/extract-photos.sh                    # Last 90 days
#   bash scripts/extract-photos.sh 2026-01-01         # Since specific date
#   bash scripts/extract-photos.sh 2026-01-01 2026-03-31  # Date range

set -euo pipefail

SINCE_DATE=${1:-$(date -v-90d +%Y-%m-%d)}
UNTIL_DATE=${2:-}
OUTPUT_DIR="$HOME/travel-imports"
OUTPUT="$OUTPUT_DIR/photos_$(date +%Y-%m-%d).json"

# Check osxphotos is installed
if ! command -v osxphotos &> /dev/null; then
  echo "Error: osxphotos not found. Install with: pipx install osxphotos"
  exit 1
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo "Extracting geotagged photos since $SINCE_DATE..."
if [ -n "$UNTIL_DATE" ]; then
  echo "  Until: $UNTIL_DATE"
fi

# Camera model -> owner mapping (current family phones only)
# Person name -> family member name mapping (Apple Photos face recognition)
CAMERA_OWNERS='{"iPhone 16 Pro Max": "Matt", "iPhone 17 Pro": "Shawna"}'
PERSON_MAP='{"Matthew Goodrich": "Matt", "Shawna Strickland": "Shawna", "Sullivan Goodrich": "Sullivan", "Collins Goodrich": "Collins"}'

# Build query args — filter to family cameras only
QUERY_ARGS=(
  query
  --from-date "$SINCE_DATE"
  --location
  --mute
  --quiet
  --query-eval "photo.exif_info and photo.exif_info.camera_model in ('iPhone 16 Pro Max', 'iPhone 17 Pro')"
  --print "{exif.camera_model}|||{photo.latitude}|||{photo.longitude}|||{photo.date}|||{place.name.city}|||{place.name.area_of_interest}|||{place.name.state_province}|||{place.name.country}|||{person}"
)

if [ -n "$UNTIL_DATE" ]; then
  QUERY_ARGS+=(--to-date "$UNTIL_DATE")
fi

echo "  Running osxphotos query..."
osxphotos "${QUERY_ARGS[@]}" 2>/dev/null | python3 -c "
import json, sys

camera_owners = $CAMERA_OWNERS
person_map = $PERSON_MAP

result = []
skipped = 0

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    parts = line.split('|||')
    if len(parts) < 9:
        skipped += 1
        continue

    model, lat_s, lng_s, date_raw, city, area, state, country, persons_raw = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6], parts[7], parts[8]
    date = date_raw[:10]  # YYYY-MM-DD from ISO datetime

    try:
        lat = float(lat_s)
        lng = float(lng_s)
    except (ValueError, TypeError):
        skipped += 1
        continue

    if not lat or not lng:
        skipped += 1
        continue

    # Use city, fall back to area_of_interest
    place_city = city if city and city != '_' else (area if area and area != '_' else '')
    place_state = state if state and state != '_' else None
    place_country = country if country and country != '_' else ''

    if not place_city and not place_country:
        skipped += 1
        continue

    # Determine who was present:
    # 1. Camera owner was definitely there
    # 2. Any recognized persons in the photo were also there
    present = set()
    camera_owner = camera_owners.get(model)
    if camera_owner:
        present.add(camera_owner)

    # Parse person field (comma-separated if multiple, '_' if none)
    if persons_raw and persons_raw.strip() != '_':
        for p in persons_raw.split(','):
            p = p.strip()
            mapped = person_map.get(p)
            if mapped:
                present.add(mapped)

    # Create one record per present family member
    for owner in sorted(present):
        result.append({
            'owner': owner,
            'lat': lat,
            'lng': lng,
            'date': date,
            'city': place_city,
            'state': place_state,
            'country': place_country,
        })

json.dump(result, open('$OUTPUT', 'w'), indent=2)

# Stats
from collections import Counter
owners = Counter(r['owner'] for r in result)
print(f'Extracted {len(result)} photo-visit records ({skipped} skipped)')
for name, count in sorted(owners.items()):
    print(f'  {name}: {count}')
" 2>&1

echo ""
echo "Output: $OUTPUT"
echo ""
echo "Next steps:"
echo "  Preview:  npx tsx scripts/import.ts photos --dry-run"
echo "  Import:   npx tsx scripts/import.ts photos"
