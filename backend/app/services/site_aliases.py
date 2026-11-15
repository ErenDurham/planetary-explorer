"""Other names the sites go by, in one place.

Used by the task interpreter (to recognise a site named in a question) and by
scripts/ingest_documents.py (to tag corpus passages with the sites they
mention). Every site's own `name` is always an alias as well; these are the
extra spellings, mission names and short forms. Lowercase.
"""
from __future__ import annotations

MARS: dict[str, list[str]] = {
    "amazonis_arcadia_ap8": ["ap-8", "ap8", "amazonis planitia", "arcadia planitia", "amazonis", "arcadia"],
    "planum_boreum": ["planum boreum", "north pole", "north polar cap", "north polar layered deposits", "npld"],
    "planum_australe": ["planum australe", "martian south pole", "south pole of mars", "south polar cap", "south polar layered deposits"],
    "mawrth_vallis": ["mawrth"],
    "noctis_labyrinthus": ["noctis"],
    "hebrus_valles": ["hebrus"],
    "huygens_crater": ["huygens"],
    "columbus_crater": ["columbus crater", "columbus"],
    "oxia_planum": ["oxia"],
    "deuteronilus_mensae": ["deuteronilus"],
    "protonilus_mensae": ["protonilus"],
    "chryse_planitia": ["chryse", "viking 1 site"],
    "meridiani_planum": ["meridiani"],
    "jezero_crater": ["jezero"],
    "utopia_planitia": ["utopia", "zhurong"],
    "elysium_planitia": ["elysium", "insight site", "insight landing site"],
    "xanthe_terra_tyras": ["xanthe terra", "xanthe", "tyras vallis", "tyras"],
}
EARTH: dict[str, list[str]] = {
    "mcmurdo_dry_valleys": ["dry valleys", "mcmurdo", "university valley", "antarctic dry valleys"],
    "summit_station_greenland": ["summit station", "summit camp", "greenland ice sheet", "greenland"],
    "south_pole_station": ["amundsen-scott", "amundsen–scott", "south pole station"],
    "painted_desert": ["painted desert", "petrified forest"],
    "jaroso_ravine": ["jaroso", "sierra almagrera"],
    "liwa_desert": ["liwa"],
    "sudbury_impact_structure": ["sudbury"],
    "yilgarn_salt_lakes": ["yilgarn", "kalgoorlie"],
    "granby_tuff": ["granby"],
    "galena_creek_rock_glacier": ["galena creek"],
    "haughton_crater": ["haughton", "devon island"],
    "channeled_scablands": ["channeled scablands", "scablands"],
    "rio_tinto": ["río tinto", "rio tinto"],
    "lake_salda": ["lake salda", "salda"],
    "dalangtan_playa": ["dalangtan", "qaidam"],
    "holuhraun_iceland": ["holuhraun", "iceland"],
    "svalbard_fan_delta": ["svalbard", "adventdalen", "spitsbergen"],
}
