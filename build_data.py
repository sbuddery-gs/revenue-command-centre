#!/usr/bin/env python3
"""
Builds data.js for the Revenue Command Centre from the Gainsight extracts.

Gainsight's company object carries Region (NA/EMEA/APAC/LATAM) but no city or
usable street address (Billing_Street__gc is unpopulated in this tenant), so
city-level SITE PLACEMENT IS DERIVED: each account is pinned to a city inside
its real Gainsight region via a stable hash of the account name. Region, ARR,
renewal date, health and CSM are all real Gainsight values.
"""
import json, hashlib, datetime, pathlib

TODAY = datetime.date(2026, 9, 18)
HOME = "London"  # the user's base — drives "near me" distances

# (city, country, lat, lon, rail_hours_from_london or None if flight)
CITIES = {
    "EMEA": [
        ("London",      "United Kingdom", 51.5074,  -0.1278, 0.0),
        ("Reading",     "United Kingdom", 51.4543,  -0.9781, 0.5),
        ("Manchester",  "United Kingdom", 53.4808,  -2.2426, 2.1),
        ("Birmingham",  "United Kingdom", 52.4862,  -1.8904, 1.4),
        ("Edinburgh",   "United Kingdom", 55.9533,  -3.1883, 4.3),
        ("Bristol",     "United Kingdom", 51.4545,  -2.5879, 1.7),
        ("Leeds",       "United Kingdom", 53.8008,  -1.5491, 2.3),
        ("Cambridge",   "United Kingdom", 52.2053,   0.1218, 0.8),
        ("Paris",       "France",         48.8566,   2.3522, 2.3),
        ("Brussels",    "Belgium",        50.8503,   4.3517, 2.0),
        ("Amsterdam",   "Netherlands",    52.3676,   4.9041, 3.8),
        ("Dublin",      "Ireland",        53.3498,  -6.2603, None),
        ("Frankfurt",   "Germany",        50.1109,   8.6821, None),
        ("Munich",      "Germany",        48.1351,  11.5820, None),
        ("Berlin",      "Germany",        52.5200,  13.4050, None),
        ("Zurich",      "Switzerland",    47.3769,   8.5417, None),
        ("Milan",       "Italy",          45.4642,   9.1900, None),
        ("Madrid",      "Spain",          40.4168,  -3.7038, None),
        ("Barcelona",   "Spain",          41.3874,   2.1686, None),
        ("Stockholm",   "Sweden",         59.3293,  18.0686, None),
        ("Copenhagen",  "Denmark",        55.6761,  12.5683, None),
        ("Warsaw",      "Poland",         52.2297,  21.0122, None),
        ("Lisbon",      "Portugal",       38.7223,  -9.1393, None),
        ("Dubai",       "UAE",            25.2048,  55.2708, None),
        ("Tel Aviv",    "Israel",         32.0853,  34.7818, None),
        ("Johannesburg","South Africa",  -26.2041,  28.0473, None),
    ],
    "NA": [
        ("San Francisco","United States", 37.7749,-122.4194, None),
        ("New York",    "United States",  40.7128, -74.0060, None),
        ("Austin",      "United States",  30.2672, -97.7431, None),
        ("Chicago",     "United States",  41.8781, -87.6298, None),
        ("Boston",      "United States",  42.3601, -71.0589, None),
        ("Seattle",     "United States",  47.6062,-122.3321, None),
        ("Denver",      "United States",  39.7392,-104.9903, None),
        ("Atlanta",     "United States",  33.7490, -84.3880, None),
        ("Los Angeles", "United States",  34.0522,-118.2437, None),
        ("Dallas",      "United States",  32.7767, -96.7970, None),
        ("Miami",       "United States",  25.7617, -80.1918, None),
        ("Phoenix",     "United States",  33.4484,-112.0740, None),
        ("Minneapolis", "United States",  44.9778, -93.2650, None),
        ("Washington",  "United States",  38.9072, -77.0369, None),
        ("Philadelphia","United States",  39.9526, -75.1652, None),
        ("San Diego",   "United States",  32.7157,-117.1611, None),
        ("Portland",    "United States",  45.5152,-122.6784, None),
        ("Toronto",     "Canada",         43.6532, -79.3832, None),
        ("Vancouver",   "Canada",         49.2827,-123.1207, None),
        ("Montreal",    "Canada",         45.5017, -73.5673, None),
    ],
    "APAC": [
        ("Tokyo",       "Japan",          35.6762, 139.6503, None),
        ("Osaka",       "Japan",          34.6937, 135.5023, None),
        ("Singapore",   "Singapore",       1.3521, 103.8198, None),
        ("Sydney",      "Australia",     -33.8688, 151.2093, None),
        ("Melbourne",   "Australia",     -37.8136, 144.9631, None),
        ("Hong Kong",   "Hong Kong",      22.3193, 114.1694, None),
        ("Seoul",       "South Korea",    37.5665, 126.9780, None),
        ("Mumbai",      "India",          19.0760,  72.8777, None),
        ("Bangalore",   "India",          12.9716,  77.5946, None),
        ("Shanghai",    "China",          31.2304, 121.4737, None),
        ("Auckland",    "New Zealand",   -36.8485, 174.7633, None),
        ("Jakarta",     "Indonesia",      -6.2088, 106.8456, None),
        ("Bangkok",     "Thailand",       13.7563, 100.5018, None),
        ("Taipei",      "Taiwan",         25.0330, 121.5654, None),
        ("Manila",      "Philippines",    14.5995, 120.9842, None),
    ],
    "LATAM": [
        ("Sao Paulo",   "Brazil",        -23.5505, -46.6333, None),
        ("Rio de Janeiro","Brazil",      -22.9068, -43.1729, None),
        ("Mexico City", "Mexico",         19.4326, -99.1332, None),
        ("Monterrey",   "Mexico",         25.6866,-100.3161, None),
        ("Buenos Aires","Argentina",     -34.6037, -58.3816, None),
        ("Bogota",      "Colombia",        4.7110, -74.0721, None),
        ("Santiago",    "Chile",         -33.4489, -70.6693, None),
        ("Lima",        "Peru",          -12.0464, -77.0428, None),
        ("Panama City", "Panama",          8.9824, -79.5199, None),
        ("Montevideo",  "Uruguay",       -34.9011, -56.1645, None),
    ],
}

# Accounts we deliberately pin (the hero risk-renewal story needs to sit near London)
PINNED = {
    "Foster Buffalo Point of Sale": "Reading",
    "Wagner Data": "Birmingham",
    "Hughes Software": "London",
    "Butler Analytics": "Manchester",
    "Larson Networks": "Dublin",
    "Oak Crest Technologies": "Cambridge",
    "Castillo Catalog": "Paris",
    "Pearson Rocky Devices": "Amsterdam",
    "Bremott": "London",
    "Harbour Cloud": "Frankfurt",
}


def stable_idx(name, n):
    h = hashlib.sha256(name.encode()).hexdigest()
    return int(h[:8], 16) % n


def haversine(lat1, lon1, lat2, lon2):
    from math import radians, sin, cos, asin, sqrt
    lat1, lon1, lat2, lon2 = map(radians, (lat1, lon1, lat2, lon2))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return round(2 * 6371 * asin(sqrt(h)))


def travel(city_rec, km):
    """Human-readable travel note from London."""
    rail = city_rec[4]
    if rail == 0.0:
        return {"mode": "local", "label": "In London", "hours": 0.0}
    if rail is not None:
        return {"mode": "rail", "label": f"{rail:g}h by rail", "hours": rail}
    hours = round(km / 750 + 1.5, 1)  # cruise + airport overhead
    return {"mode": "air", "label": f"~{hours:g}h door-to-door", "hours": hours}


def main():
    root = pathlib.Path(__file__).parent
    cities_by_name = {c[0]: (r, c) for r, lst in CITIES.items() for c in lst}

    # --- company-level risk detail (narratives + Staircase signals) --------
    detail_raw = json.loads((root / "data/gainsight-risk-detail.json").read_text())["accounts"]
    detail = {}
    for name, d in detail_raw.items():
        d = dict(d)
        # Gainsight stores "not scored" as 0 for these Staircase measures --
        # normalise so the UI can say "not scored" rather than showing a real 0.
        for k in ("staircaseHealth", "riskScore"):
            if d.get(k) in (0, None):
                d[k] = None
        d.setdefault("signals", {})
        for k in ("dark", "singleThreaded", "noMeetings", "noRenewalDiscussion",
                  "stakeholderNotEngaged", "slowResponses", "noExecComms"):
            d["signals"].setdefault(k, False)
        for k in ("riskSynopsis", "renewalRiskSummary", "rootCause", "customerSaid",
                  "alreadyTried", "successDefinition", "churnRiskLevel", "sentiment",
                  "stakeholderEngagement", "execSponsor", "lastQbr",
                  "licensedUsers", "activeUsers", "totalOpenCtas", "csmEmail"):
            d.setdefault(k, None)
        detail[name] = d

    # --- risks, keyed by account -------------------------------------------
    risks = {}
    for line in (root / "data/gainsight-risks.psv").read_text().strip().split("\n"):
        acct, name, ctype, reason, prio, due, owner = line.split("|")
        risks.setdefault(acct, []).append(
            {"name": name, "type": ctype, "reason": reason,
             "priority": prio, "due": due, "owner": owner}
        )

    # --- accounts -----------------------------------------------------------
    accounts = []
    for line in (root / "data/gainsight-companies.psv").read_text().strip().split("\n"):
        name, arr, renewal, region, health, csm, industry = line.split("|")
        if name in PINNED:
            city = cities_by_name[PINNED[name]][1]
        else:
            pool = CITIES[region]
            city = pool[stable_idx(name, len(pool))]
        km = haversine(51.5074, -0.1278, city[2], city[3])
        r = datetime.date.fromisoformat(renewal)
        days = (r - TODAY).days
        acct_risks = risks.get(name, [])
        accounts.append({
            "name": name,
            "arr": int(arr),
            "renewal": renewal,
            "daysToRenewal": days,
            "region": region,
            "health": health,
            "csm": csm,
            "industry": industry or "Unclassified",
            "city": city[0],
            "country": city[1],
            "lat": city[2],
            "lon": city[3],
            "kmFromHome": km,
            "travel": travel(city, km),
            "risks": acct_risks,
            "riskCount": len(acct_risks),
            "detail": detail.get(name),
            "topRiskPriority": (
                "Critical" if any(x["priority"] == "Critical" for x in acct_risks)
                else "High" if any(x["priority"] == "High" for x in acct_risks)
                else "Medium" if acct_risks else None
            ),
        })

    accounts.sort(key=lambda a: -a["arr"])

    payload = {
        "meta": {
            "source": "Gainsight CS via MCP",
            "detailNote": ("Risk narratives, Staircase AI signal flags, sentiment and churn-risk "
                           "level come from the Gainsight company record. Resolution plays are "
                           "generated in app.js from those fields — they are recommendations, "
                           "not Gainsight data."),
            "generated": TODAY.isoformat(),
            "home": HOME,
            "accountCount": len(accounts),
            "totalArr": sum(a["arr"] for a in accounts),
            "geoNote": ("Region, ARR, renewal date, health score, CSM and all risk CTAs are live "
                        "Gainsight values. Gainsight holds no city/address data for these accounts, "
                        "so city-level site placement is derived from the account's real region."),
        },
        "accounts": accounts,
    }

    out = root / "data.js"
    out.write_text("window.GS_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n")

    # ---- reconciliation report --------------------------------------------
    from collections import Counter
    print(f"accounts        : {len(accounts)}")
    print(f"total ARR       : ${payload['meta']['totalArr']:,}")
    reg = Counter()
    regarr = Counter()
    for a in accounts:
        reg[a["region"]] += 1
        regarr[a["region"]] += a["arr"]
    for k in ("NA", "EMEA", "APAC", "LATAM"):
        print(f"  {k:<6}: {reg[k]:>3} accts  ${regarr[k]:>10,}")
    win = [a for a in accounts if 0 <= a["daysToRenewal"] <= 194]
    print(f"renewals <=194d : {len(win)}  ${sum(a['arr'] for a in win):,}")
    print(f"accts with risk : {sum(1 for a in accounts if a['riskCount'])}")
    print(f"risk CTAs total : {sum(a['riskCount'] for a in accounts)}")
    print(f"with detail     : {sum(1 for a in accounts if a['detail'])}")
    print(f"with narrative  : {sum(1 for a in accounts if a['detail'] and a['detail'].get('rootCause'))}")
    orphan = [n for n in detail if not any(a['name'] == n for a in accounts)]
    if orphan:
        print(f"!! detail with no matching account: {orphan}")
    missing = [a['name'] for a in accounts if a['riskCount'] and not a['detail']]
    if missing:
        print(f"!! risk account with no detail: {missing}")
    print(f"wrote {out.name} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
