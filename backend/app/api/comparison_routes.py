from fastapi import APIRouter
from app.models.comparison import ComparisonCatalog
from app.services.comparison_catalog import comparison_catalog

router = APIRouter(prefix="/api/v1")

@router.get("/comparison/catalog", response_model=ComparisonCatalog)
def get_comparison_catalog() -> ComparisonCatalog:
    """Earth, Mars and Moon locations, original measurements and body references.

    No cross-body landing score is computed by this endpoint.
    """
    return comparison_catalog()
