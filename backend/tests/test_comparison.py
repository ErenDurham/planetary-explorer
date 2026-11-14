from app.services.data_loader import get_store

def test_catalog_has_three_bodies_and_preserves_profiles(client):
    r = client.get("/api/v1/comparison/catalog")
    assert r.status_code == 200
    data = r.json()
    assert {b["id"] for b in data["bodies"]} == {"earth", "mars", "moon"}
    assert len({(s["body"], s["id"]) for s in data["locations"]}) == len(data["locations"])
    for s in data["locations"]:
        for m in s["measurements"]:
            assert not m["source_id"] or m["source_id"] in s["sources"]
            if m["is_missing"]:
                assert m["value"] is None
        if s["body"] in ("earth", "mars"):
            profile = get_store().earth_profile(s["id"]) if s["body"] == "earth" else get_store().profile(s["id"])
            assert s["measurements"] == profile.model_dump(mode="json")["measurements"]

def test_lunar_locations_do_not_invent_numeric_measurements(client):
    locations = client.get("/api/v1/comparison/catalog").json()["locations"]
    moon = [s for s in locations if s["body"] == "moon"]
    assert len(moon) >= 2
    for s in moon:
        assert s["source_ids"]
        assert all(m["measurement_type"] == "literature" and not isinstance(m["value"], (int, float)) for m in s["measurements"])
        assert "no numeric profile" in s["coverage"]
