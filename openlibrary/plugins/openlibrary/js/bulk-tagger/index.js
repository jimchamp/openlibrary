/**
 * Returns the HMTL for the Bulk Tagger component.
 *
 * @returns HTML for the bulk tagging form
 */
export function renderBulkTagger() {
    return `<div class="bulk-tagger hidden">
        <div class="bulk-tagger__header">
            <div class="type-selector">
                <span class="tab tab-option--subject tab--selected">Subjects</span>
                <span class="tab tab-option--collection">Collections</span>      
            </div>
            <div class="bulk-tagger__close">x</div>
        </div>
        ${renderSubjectTagForm()}
        ${renderCollectionTagForm()}
    </div>`
}

function renderSubjectTagForm() {
    return `<form action="/tags/bulk_tag_works" method="post" class="subject-tag-form">
        <div class="search-subject-container">
            <input type="text" class="subjects-search-input" placeholder='Filter subjects e.g. Epic'>
        </div>
        <input name="work_ids" value="" type="hidden">
        <input name="tags_to_add" value="" type="hidden">
        <input name="tags_to_remove" value="" type="hidden">
        <div class="loading-indicator"></div>
        <div class="selection-container hidden">
            <div class="selected-tag-subjects"></div>
            <div class="subjects-search-results"></div>
            <div class="create-new-subject-tag">
                <div class="search-subject-row-name search-subject-row-name-create hidden">
                    <div class="search-subject-row-name-create-p">Create new subject <strong class="subject-name"></strong> with type:</div>
                    <div class="search-subject-row-name-create-select">
                        <div class="subject-type-option subject-type-option--subject" data-tag-type="subjects">subject</div>
                        <div class="subject-type-option subject-type-option--person" data-tag-type="subject_people">person</div>
                        <div class="subject-type-option subject-type-option--place" data-tag-type="subject_places">place</div>
                        <div class="subject-type-option subject-type-option--time" data-tag-type="subject_times">time</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="submit-tags-section">
            <button type="submit" class="bulk-tagging-submit cta-btn cta-btn--primary" disabled>Submit</button>
        </div>
    </form>`
}

function renderCollectionTagForm() {
    return `<form action="" method="post" class="collection-form hidden">
        <div class="collection-form__search">
            <input class="collection-form__search-input" type="text" placeholder="Search for collection tag">
        </div>
        <input name="work_ids" value="" type="hidden">
        <input name="tags_to_add" value="" type="hidden">
        <input name="tags_to_remove" value="" type="hidden">
        <div class="loading-indicator"></div>
        <div class="collection-form__tag-container">
            <div class="collection-form__selected-tags"></div>
            <div class="collection-form__search-results"></div>
            <div class="collections-form__tag-creator hidden">
                <div class="collections-form__create-prompt">
                    Click to create new collection identifier <span class="collections-form__id-name"></span>
                </div>
            </div>
        </div>
        <div class="collection-form__submit">
            <button type="submit" class="collection-form__submit-button cta-btn cta-btn--primary" disabled>Submit</button>
        </div>
    </form>`
}
