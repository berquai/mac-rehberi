"""Maç Rehberi veri toplayıcı.

Yayın takvimi: Spor Ekranı (sporekrani.com) günlük sayfaları.
Futbol skorları: ESPN herkese açık scoreboard servisi.

Çıktı: docs/data.json
Sadece Python standart kütüphanesi kullanır (GitHub Actions'ta kurulum gerekmez).
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

TR = timezone(timedelta(hours=3))  # Europe/Istanbul (yaz saati uygulanmıyor)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MacRehberi/1.0 (kisisel kullanim)"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data.json"
DAYS_AHEAD = 7


# --------------------------------------------------------------------------- yardımcılar
def get(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fold(s: str) -> str:
    """Türkçe karakterleri sadeleştir, küçük harfe çevir: 'Kadınlar Şampiyonlar' -> 'kadinlar sampiyonlar'."""
    s = (s or "").replace("ı", "i").replace("İ", "i")
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.lower()).strip()


# --------------------------------------------------------------------------- kapsam kuralları
SPORTS = {"futbol": "football", "basketbol": "basketball", "voleybol": "volleyball"}

# Kulüp ligleri: sadeleştirilmiş lig adı bu kalıplardan birine TAM uymalı.
CLUB_LEAGUES = {
    "football": [r"trendyol super lig", r"uefa sampiyonlar ligi"],
    "basketball": [r"(turkiye )?basketbol super ligi", r"kadinlar basketbol super ligi", r"fiba sampiyonlar ligi"],
    "volleyball": [r"tvf efeler ligi", r"tvf sultanlar ligi", r"cev (erkekler |kadinlar )?sampiyonlar ligi"],
}

# Milli maçlar: Türkiye A takımı, resmi turnuva.
NATIONAL_TEAM = re.compile(r"^turkiye( a)?$|^turkey$")
NATIONAL_EXCLUDE = re.compile(
    r"(u\s?\d{2}|\bgenc|umit|yildiz|hazirlik|dostluk|ozel mac|gosteri|friendly|olimpik|universite|akdeniz)"
)
WOMEN = re.compile(r"\bkadin|sultanlar")

seen_leagues: dict[str, int] = {}  # tanı amaçlı


def classify(ev: dict) -> dict | None:
    sport = SPORTS.get(fold(ev.get("sport_name", "")))
    if not sport or ev.get("event_type_name") != "match":
        return None
    league = ev.get("league_name") or ""
    lf = fold(league)
    key = f"{sport}: {league}"
    seen_leagues[key] = seen_leagues.get(key, 0) + 1
    home, away = fold(ev.get("home_name")), fold(ev.get("away_name"))

    is_club = any(re.fullmatch(p, lf) for p in CLUB_LEAGUES[sport])
    is_nat = (
        not is_club
        and bool(NATIONAL_TEAM.match(home) or NATIONAL_TEAM.match(away))
        and not NATIONAL_EXCLUDE.search(lf)
        and not (sport == "football" and WOMEN.search(lf))  # futbolda sadece erkek milli takım
    )
    if not (is_club or is_nat):
        return None
    return {"sport": sport, "league": league, "national": is_nat, "women": bool(WOMEN.search(lf))}


# --------------------------------------------------------------------------- Spor Ekranı
def parse_dt(s: str) -> datetime:
    if s.endswith("Z") or "T" in s:
        d = datetime.fromisoformat(s.replace("Z", "+00:00").split(".")[0] + "+00:00") if "." in s else \
            datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d.astimezone(TR)
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=TR)


def extract_events(html: str) -> list[dict]:
    dec = json.JSONDecoder()
    found: dict[int, dict] = {}
    for m in re.finditer(r'"events":\[', html):
        try:
            arr, _ = dec.raw_decode(html, m.end() - 1)
        except ValueError:
            continue
        for ev in arr:
            if isinstance(ev, dict) and "id" in ev and "date_time" in ev:
                found[ev["id"]] = ev
    return list(found.values())


def channel_list(ev: dict) -> list[dict]:
    out = []
    for ch in sorted(ev.get("channels") or [], key=lambda c: c.get("priority") or 0):
        if ch.get("active") == 0:
            continue
        plats = []
        for p in ch.get("providers") or []:
            if p.get("active") == 0:
                continue
            no = p.get("channel_no")
            plats.append({"name": p.get("name") or p.get("alt") or "", "no": no if no not in ("", None) else None})
        out.append({"name": ch.get("name") or "", "platforms": plats})
    return out


def fetch_schedule(today: datetime) -> list[dict]:
    matches: dict[int, dict] = {}
    for off in range(-1, DAYS_AHEAD + 1):
        day = (today + timedelta(days=off)).strftime("%Y-%m-%d")
        try:
            html = get(f"https://www.sporekrani.com/home/day/{day}")
        except Exception as e:  # noqa: BLE001
            print(f"[uyarı] {day} alınamadı: {e}", file=sys.stderr)
            continue
        for ev in extract_events(html):
            info = classify(ev)
            if not info:
                continue
            start = parse_dt(ev["date_time"])
            matches[ev["id"]] = {
                "id": f"se{ev['id']}",
                **info,
                "home": ev.get("home_name") or "",
                "away": ev.get("away_name") or "",
                "start": start.isoformat(),
                "channels": channel_list(ev),
                "note": ev.get("event_text") or "",
                "score": None,
                "status": "scheduled",
            }
    return list(matches.values())


# --------------------------------------------------------------------------- ESPN futbol skorları
ESPN_LEAGUES = ["tur.1", "uefa.champions", "fifa.worldq.uefa", "uefa.nations", "uefa.euroq", "fifa.world", "uefa.euro"]

# ESPN İngilizce isim -> Türkçe eşleştirme yardımı (sadeleştirilmiş)
ALIASES = {
    "turkey": "turkiye", "besiktas": "besiktas", "fenerbahce": "fenerbahce", "galatasaray": "galatasaray",
    "bayern munich": "bayern munih", "inter milan": "inter", "internazionale": "inter",
    "ac milan": "milan", "juventus": "juventus", "atletico madrid": "atletico madrid",
    "paris saint-germain": "paris saint germain", "psg": "paris saint germain",
}
STOP = {"fk", "fc", "sk", "jk", "as", "ac", "cf", "the", "a.s.", "spor", "kulubu", "club", "de", "sc", "afc"}


def tokens(name: str) -> set[str]:
    n = fold(name)
    n = ALIASES.get(n, n)
    return {t for t in re.split(r"[^a-z0-9]+", n) if len(t) > 2 and t not in STOP}


def fetch_espn(today: datetime) -> list[dict]:
    res = []
    for d in (today - timedelta(days=1), today):
        ds = d.strftime("%Y%m%d")
        for lg in ESPN_LEAGUES:
            try:
                data = json.loads(get(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard?dates={ds}"))
            except Exception as e:  # noqa: BLE001
                print(f"[uyarı] ESPN {lg} {ds}: {e}", file=sys.stderr)
                continue
            for e in data.get("events", []):
                comp = e["competitions"][0]
                cs = {c["homeAway"]: c for c in comp["competitors"]}
                st = e["status"]["type"]
                res.append({
                    "start": datetime.fromisoformat(e["date"].replace("Z", "+00:00")).astimezone(TR),
                    "home": cs["home"]["team"].get("displayName", ""),
                    "away": cs["away"]["team"].get("displayName", ""),
                    "hs": cs["home"].get("score"), "as": cs["away"].get("score"),
                    "state": st.get("state"),  # pre / in / post
                    "detail": st.get("shortDetail", ""),
                })
    return res


def attach_scores(matches: list[dict], results: list[dict]) -> None:
    for m in matches:
        if m["sport"] != "football":
            continue
        ms = datetime.fromisoformat(m["start"])
        th, ta = tokens(m["home"]), tokens(m["away"])
        best = None
        for r in results:
            if abs((r["start"] - ms).total_seconds()) > 3 * 3600:
                continue
            rh, ra = tokens(r["home"]), tokens(r["away"])
            if (th & rh) or (ta & ra):
                best = r
                break
        if not best or best["state"] == "pre":
            continue
        m["score"] = {"home": best["hs"], "away": best["as"]}
        m["status"] = "finished" if best["state"] == "post" else "live"
        m["detail"] = best["detail"]


# --------------------------------------------------------------------------- ana akış
def main() -> int:
    now = datetime.now(TR)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    matches = fetch_schedule(today)
    if not matches:
        print("[hata] Hiç maç bulunamadı; mevcut data.json korunuyor.", file=sys.stderr)
        return 1
    try:
        attach_scores(matches, fetch_espn(today))
    except Exception as e:  # noqa: BLE001
        print(f"[uyarı] skorlar eklenemedi: {e}", file=sys.stderr)

    # Dünden önceki günler gerekmez (sonuçlar ertesi gün 00:00'da kalkar).
    yesterday = today - timedelta(days=1)
    matches = [m for m in matches if datetime.fromisoformat(m["start"]) >= yesterday]
    matches.sort(key=lambda m: m["start"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"generated_at": now.isoformat(timespec="seconds"), "matches": matches},
                   ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    by = {}
    for m in matches:
        by[m["league"]] = by.get(m["league"], 0) + 1
    print(f"{len(matches)} maç yazıldı -> {OUT}")
    for k, v in sorted(by.items(), key=lambda x: -x[1]):
        print(f"  {v:3d}  {k}")
    if "--leagues" in sys.argv:
        print("\nGörülen tüm ligler (futbol/basketbol/voleybol):")
        for k, v in sorted(seen_leagues.items()):
            print(f"  {v:3d}  {k}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
