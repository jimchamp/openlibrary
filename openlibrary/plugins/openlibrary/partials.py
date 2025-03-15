import json
from abc import abstractmethod, ABC
from urllib.parse import parse_qs

import web

from infogami.utils import delegate
from infogami.utils.view import render_template

from openlibrary.core import cache
from openlibrary.core.fulltext import fulltext_search
from openlibrary.core.lending import get_available
from openlibrary.plugins.worksearch.code import do_search, work_search
from openlibrary.plugins.worksearch.subjects import get_subject
from openlibrary.utils import dateutil
from openlibrary.views.loanstats import get_trending_books


class PartialResolutionError(Exception):
    pass


class PartialDataHandler(ABC):
    """Base class for partial data handlers.

    Has a single method, `generate`, that is expected to return a
    JSON-serializable dict that contains data necessary to update
    a page.
    """
    @abstractmethod
    def generate(self) -> dict:
        pass


class RelatedWorksPartial(PartialDataHandler):
    """Handler for the related works carousels."""
    def __init__(self):
        self.i = web.input(workid=None)

    def generate(self) -> dict:
        return self._get_relatedcarousels_component(self.i.workid)

    def _get_relatedcarousels_component(self, workid) -> dict:
        if 'env' not in web.ctx:
            delegate.fakeload()
        work = web.ctx.site.get('/works/%s' % workid) or {}
        component = render_template('books/RelatedWorksCarousel', work)
        return {0: str(component)}

    def _get_cached_relatedcarousels_component(self, *args, **kwargs):
        memoized_get_component_metadata = cache.memcache_memoize(
            self._get_relatedcarousels_component,
            "book.bookspage.component.relatedcarousels",
            timeout=dateutil.HALF_DAY_SECS,
        )
        return (
            memoized_get_component_metadata(*args, **kwargs)
            or memoized_get_component_metadata.update(*args, **kwargs)[0]
        )


class CarouselCardPartial(PartialDataHandler):
    """Handler for carousel "load_more" requests"""
    def __init__(self):
        self.i = web.input(params=None)

    def generate(self) -> dict:
        # Determine query type
        params = self.i or {}
        query_type = params.get("queryType", "")

        # Do search
        search_results = self._make_book_query(query_type, params)

        # Render cards
        cards = []
        layout = params.get("layout")
        key = params.get("key") or ""
        for index, book in enumerate(search_results):
            lazy = index > 5
            cards.append(render_template("books/custom_carousel_card", web.storage(book), lazy, layout, key=key))

        # Return partials dict:
        return {"partials": [str(template) for template in cards]}

    def _make_book_query(self, query_type: str, params: dict) -> list:
        if query_type == "SEARCH":
            return self._do_search_query(params)
        if query_type == "BROWSE":
            return self._do_browse_query(params)
        if query_type == "TRENDING":
            return self._do_trends_query(params)
        if query_type == "SUBJECTS":
            return self._do_subjects_query(params)

        raise ValueError("Unknown query type")

    def _do_search_query(self, params: dict) -> list:
        fields = 'key,title,subtitle,author_name,cover_i,ia,availability,id_project_gutenberg,id_project_runeberg,id_librivox,id_standard_ebooks,id_openstax'
        query = params.get("q", "")
        sort = params.get("sorts", "new")  # XXX : check "new" assumption
        limit = int(params.get("limit", 20))
        page = int(params.get("page", 1))
        query_params = {
            "q": query,
            "fields": fields,
        }
        if fulltext := params.get("hasFulltextOnly"):
            query_params['has_fulltext'] = 'true'

        results = work_search(query_params, sort=sort, limit=limit, facet=False, offset=page)
        return results.get("docs", [])

    def _do_browse_query(self, params: dict) -> list:
        query = params.get("q", "")
        limit = int(params.get("limit", 18))
        page = int(params.get("page", 1))
        subject = params.get("subject", "")
        sorts = params.get("sorts", "").split(",")

        results = get_available(query=query, page=page, subject=subject, limit=limit, sorts=sorts)
        return results if "error" not in results else []

    def _do_trends_query(self, params: dict) -> list:
        page = int(params.get("page", 1))
        limit = int(params.get("limit", 18))
        return get_trending_books(minimum=3, limit=limit, page=page, books_only=True, sort_by_count=False)

    def _do_subjects_query(self, params: dict) -> list:
        pseudoKey = params.get("q", "")
        offset = int(params.get("page", 1))
        limit = int(params.get("limit", 20))

        subject = get_subject(pseudoKey, offset=offset, limit=limit)
        return subject.get("works", [])


class AffiliateLinksPartial(PartialDataHandler):
    """Handler for affiliate links"""

    def __init__(self):
        self.i = web.input(data=None)

    def generate(self) -> dict:
        data = json.loads(self.i.data)
        args = data.get("args", [])

        if len(args) < 2:
            raise PartialResolutionError("Unexpected amount of arguments")

        macro = web.template.Template.globals['macros'].AffiliateLinks(
            args[0], args[1]
        )
        return {"partials": str(macro)}


class SearchFacetsPartial(PartialDataHandler):
    """Handler for search facets sidebar and "selected facets" affordances."""

    def __init__(self):
        self.i = web.input(data=None)

    def generate(self) -> dict:
        data = json.loads(self.i.data)
        path = data.get('path')
        query = data.get('query', '')
        parsed_qs = parse_qs(query.replace('?', ''))
        param = data.get('param', {})

        sort = None
        search_response = do_search(
            param, sort, rows=0, spellcheck_count=3, facet=True
        )

        sidebar = render_template(
            'search/work_search_facets',
            param,
            facet_counts=search_response.facet_counts,
            async_load=False,
            path=path,
            query=parsed_qs,
        )

        active_facets = render_template(
            'search/work_search_selected_facets',
            param,
            search_response,
            param.get('q', ''),
            path=path,
            query=parsed_qs,
        )

        return {
            "sidebar": str(sidebar),
            "title": active_facets.title,
            "activeFacets": str(active_facets).strip(),
        }


class FullTextSuggestionsPartial(PartialDataHandler):
    """Handler for rendering full-text search suggestions."""

    def __init__(self):
        self.i = web.input(data=None)

    def generate(self) -> dict:
        query = self.i.get("data", "")
        data = fulltext_search(query)
        # Add caching headers only if there were no errors in the search results
        if 'error' not in data:
            # Cache for 5 minutes (300 seconds)
            web.header('Cache-Control', 'public, max-age=300')
        hits = data.get('hits', [])
        if not hits['hits']:
            macro = '<div></div>'
        else:
            macro = web.template.Template.globals[
                'macros'
            ].FulltextSearchSuggestion(query, data)
        return {"partials": str(macro)}


class PartialRequestResolver:
    # Maps `_component` values to PartialDataHandler subclasses
    component_mapping = {
        "RelatedWorkCarousel": RelatedWorksPartial,
        "CarouselLoadMore": CarouselCardPartial,
        "AffiliateLinks": AffiliateLinksPartial,
        "SearchFacets": SearchFacetsPartial,
        "FulltextSearchSuggestion": FullTextSuggestionsPartial,
    }

    @staticmethod
    def resolve(component: str) -> dict:
        """Gets an instantiated PartialDataHandler and returns its generated dict"""
        handler = PartialRequestResolver.get_handler(component)
        return handler.generate()

    @classmethod
    def get_handler(cls, component: str) -> PartialDataHandler:
        """Instantiates and returns the requested handler"""
        if klass := cls.component_mapping.get(component):
            return klass()
        raise PartialResolutionError(f'No handler found for key "{component}"')


class Partials(delegate.page):
    path = '/partials'
    encoding = 'json'

    def GET(self):
        i = web.input(_component=None)
        component = i.pop("_component")
        return delegate.RawText(json.dumps(PartialRequestResolver.resolve(component)))

def setup():
    pass
