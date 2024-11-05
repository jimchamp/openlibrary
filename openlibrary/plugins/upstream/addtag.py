"""Handlers for adding and editing tags."""

import web

from typing import NoReturn

from infogami.core.db import ValidationException
from infogami.utils.view import add_flash_message, public
from infogami.infobase.client import ClientException
from infogami.utils import delegate

from openlibrary.accounts import get_current_user
from openlibrary.plugins.upstream import spamcheck, utils
from openlibrary.plugins.upstream.models import Tag
from openlibrary.plugins.upstream.addbook import safe_seeother, trim_doc
from openlibrary.plugins.upstream.utils import render_template
from openlibrary.plugins.worksearch.subjects import get_subject


SUBJECT_SUB_TYPES = ["subject", "person", "place", "time"]
TAG_TYPES = SUBJECT_SUB_TYPES + ["collection"]


@public
def get_tag_types():
    return TAG_TYPES

# TODO : Remove or move to class-level
def validate_tag(tag, for_promotion=False):
    return (
        (tag.get('name', '') and tag.get('fkey', None))
        if for_promotion
        else (tag.get('name', '') and tag.get('tag_type', ''))
    )

# TODO : Remove or move to class-level
def has_permission(user) -> bool:
    """
    Can a tag be added?
    """
    return user and (
        user.is_librarian() or user.is_super_librarian() or user.is_admin()
    )


def create_subject_tag(name: str, description: str, fkey: str = '', body: str = '') -> Tag:
    d = {
        "name": name,
        "tag_description": description,
        "type": {"key": "/type/tag"},
        "tag_type": 'subject',  # TODO : pass type into function
        "fkey": fkey,
        "body": body,
    }
    tag = Tag.create(trim_doc(d))
    if fkey and not body:
        subject = get_subject(
            fkey,
            details=True,
            filters={'public_scan_b': 'false', 'lending_edition_s': '*'},
            sort='readinglog'
        )
        if subject and subject.work_count > 0:
            tag.body = str(render_template('subjects/default_view', subject))
            tag._save()
    return tag


class addtag(delegate.page):
    path = '/tag/add'

    def GET(self):
        """Main user interface for adding a tag to Open Library."""
        if not (patron := get_current_user()):
            raise web.seeother(f'/account/login?redirect={self.path}')

        if not has_permission(patron):
            raise web.unauthorized(message='Permission denied to add tags')

        i = web.input(name=None, type=None, sub_type=None, fkey=None)

        return render_template(
            'tag/add', i.name, i.type)

    def POST(self):
        i = web.input(
            name="",
            tag_type="",
            tag_description="",
            body="",
            fkey=None,
        )

        if spamcheck.is_spam(i, allow_privileged_edits=True):
            return render_template(
                "message.html", "Oops", 'Something went wrong. Please try again later.'
            )

        if not (patron := get_current_user()):
            raise web.seeother(f'/account/login?redirect={self.path}')

        if not has_permission(patron):
            raise web.unauthorized(message='Permission denied to add tags')

        i = utils.unflatten(i)

        if not validate_tag(i):
            raise web.badrequest()

        match = self.find_match(i)  # returns None or Tag (if match found)

        if match:
            # tag match
            return self.tag_match(match)
        else:
            # no match
            return self.no_match(i)

    def find_match(self, i: web.utils.Storage):
        """
        Tries to find an existing tag that matches the data provided by the user.
        """
        return Tag.find(i.name, i.tag_type)

    def tag_match(self, match: list) -> NoReturn:
        """
        Action for when an existing tag has been found.
        Redirect user to the found tag's edit page to add any missing details.
        """
        tag = web.ctx.site.get(match[0])
        raise safe_seeother(tag.key + "/edit")

    def no_match(self, i: web.utils.Storage) -> NoReturn:
        """
        Action to take when no tags are found.
        Creates a new Tag.
        Redirects the user to the tag's home page
        """
        tag = create_subject_tag(i.name, i.tag_description, fkey=i.fkey, body=i.body)
        raise safe_seeother(tag.key)


class tag_edit(delegate.page):
    path = r"(/tags/OL\d+T)/edit"

    def GET(self, key):
        if not web.ctx.site.can_write(key):
            return render_template(
                "permission_denied",
                web.ctx.fullpath,
                "Permission denied to edit " + key + ".",
            )

        tag = web.ctx.site.get(key)
        if tag is None:
            raise web.notfound()

        tag_type = "subject" if tag.tag_type in SUBJECT_SUB_TYPES else tag.tag_type
        return render_template(f'type/tag/{tag_type}/edit', tag)

    def POST(self, key):
        tag = web.ctx.site.get(key)
        if tag is None:
            raise web.notfound()

        i = web.input(_comment=None)
        formdata = self.process_input(i)
        # TODO : strip `formdata` of unrelated sub-type fields
        try:
            if not formdata or not validate_tag(formdata):
                raise web.badrequest()
            elif "_delete" in i:
                tag = web.ctx.site.new(
                    key, {"key": key, "type": {"key": "/type/delete"}}
                )
                tag._save(comment=i._comment)
                raise safe_seeother(key)
            else:
                tag.update(formdata)
                tag._save(comment=i._comment)
                raise safe_seeother(key)
        except (ClientException, ValidationException) as e:
            add_flash_message('error', str(e))
            return render_template("type/tag/edit", tag)

    def process_input(self, i):
        # TODO : Remove `unflatten`, as it's not needed in this context
        i = utils.unflatten(i)
        tag = trim_doc(i)
        return tag


def find_tag(tag_type: str, **kwargs) -> Tag:
    q = {k:v for k, v in kwargs.items()} | {"type": "/type/tag", "tag_type": tag_type}
    matches = web.ctx.site.things(q)

    return web.ctx.site.get(matches[0]) if matches else None


class edit_subject(delegate.page):
    path = "/subject/edit"

    def GET(self):
        i = web.input(fkey="", name="", sub_type="")

        # Check for edit permission
        if not (patron := get_current_user()):
            raise safe_seeother(f"/account/login?redirect={i.fkey or '/'}")

        if not self.has_permission(patron):
            raise web.unauthorized()

        if not self.validate_input(i):
            raise web.badrequest()

        # Resolve code path : either Tag exists, or it doesn't
        tag = find_tag("subject", fkey=i.fkey)

        # Tag exists:
        if tag:
            raise web.seeother(f"{tag.key}/edit")

        # Tag does not exist:
        # TODO : Test `safe_seeother` use when i.name has non-ASCII text
        raise safe_seeother(f"/tag/subject/add?name={i.name}&tag_type={i.sub_type}&fkey={i.fkey}")

    def has_permission(self, user) -> bool:
        return user and (
                user.is_librarian() or user.is_super_librarian() or user.is_admin()
        )

    def validate_input(self, i) -> bool:
        return i.get("fkey") and i.get("name") and i.get("sub_type")


class add_subject_tag(delegate.page):
    path = "/tag/subject/add"

    def GET(self):
        if not (patron := get_current_user()):
            raise web.seeother(f'/account/login?redirect={self.path}')

        if not self.has_permission(patron):
            raise web.unauthorized()

        i = web.input(name="", fkey="", tag_type="")
        page = {
            "name": i.name,
            "tag_type": i.tag_type,
            "fkey": i.fkey,
        }

        return render_template("type/tag/subject/edit", page)

    def POST(self):
        i = web.input()
        if not (patron := get_current_user()):
            # TODO : Redirect to subject page (?)
            raise web.seeother(f'/account/login')

        if not self.has_permission(patron):
            raise web.unauthorized()

        # TODO : Create tag
        # TODO : Go to subject page, no disambiguations
        pass

    def has_permission(self, user) -> bool:
        return user and (
            user.is_librarian() or user.is_super_librarian() or user.is_admin()
        )

def setup():
    """Do required setup."""
    pass
