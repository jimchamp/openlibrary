import web

from infogami.utils import delegate
from infogami.utils.view import thingview

from openlibrary.core import cache
from openlibrary.plugins.openlibrary.home import caching_prethread
from openlibrary.utils.dateutil import MINUTE_SECS


def get_page(path: str):
    record = web.ctx.site.get(path)

    if not record:
        raise web.notfound()

    template = thingview(record)
    return dict(template)


def get_cached_page(path: str, timeout: int = (5 * MINUTE_SECS)) -> dict:
    mc = cache.memcache_memoize(
        get_page,
        path,
        timeout=timeout,
        prethread=caching_prethread(),
    )
    page = mc(path)

    if not page:
        mc(_cache='delete')

    return page


class collections_index_handler(delegate.page):
    path = '/_collections'

    def GET(self):
        t = get_cached_page('/collections')
        return web.template.TemplateResult(t)


class collection_handler(delegate.page):
    path = '/_collections(/.*)?'

    def GET(self, path):
        t = get_cached_page(f'/collections{path}')
        return web.template.TemplateResult(t)


def setup():
    pass
