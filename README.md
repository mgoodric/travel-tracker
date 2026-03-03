# Travel Tracker — UC-03/04

Self-hosted React + FastAPI app for tracking airport, city, state, and country visits per family member.

## Stack
- Frontend: React + Leaflet maps + Tailwind
- Backend: FastAPI + asyncpg
- Database: apps Postgres database (person_airports, person_countries materialized views)
- Seed data: OurAirports CSV (scripts/import_airports.py)

## Getting Started
TODO: Scaffold with `create-react-app` or Vite
TODO: Implement FastAPI backend with airport/flight endpoints
TODO: Import OurAirports dataset

## Key Features
- Per-family-member visit tracking
- Interactive Leaflet map with visited airports/regions
- Automatic feed from pilot logbook (UC-24 if re-added)
- Year-in-review report generation
