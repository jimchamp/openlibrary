import { defineCustomElement } from 'vue'

import AuthorIdentifiers from './AuthorIdentifiers.ce.vue'
import HelloWorld from './HelloWorld.ce.vue'
// import LibraryExplorer from './LibraryExplorer.ce.vue'
import MergeUI from './MergeUI.ce.vue'
import ObservationForm from './ObservationForm.ce.vue'

export async function initComponents() {
    const styles = await get_styles()

    ObservationForm.styles = [styles.flat().join('')];

    customElements.define('ol-author-identifiers', defineCustomElement(AuthorIdentifiers))
    customElements.define('ol-hello-world', defineCustomElement(HelloWorld))
    // customElements.define('ol-library-explorer', defineCustomElement(LibraryExplorer))

    // customElements.define('ol-merge-u-i', defineCustomElement({...MergeUI, AsyncComputed}))
    // const ce = defineCustomElement({
    //     setup() {
    //         const app = createApp()
    //         app.use(AsyncComputed)
    //     },
    //     render() {
    //         return h(MergeUI)
    //     }
    // })
    // console.log(ce)
    // console.log()
    // console.log(defineCustomElement(ObservationForm))

    // customElements.define('ol-merge-u-i', defineCustomElement(MergeUI, {
    //     plugins: [AsyncComputed],
    //     setup() {
    //         const app = createApp()
    //         app.use(AsyncComputed)
    //     }
    // }))
    customElements.define('ol-observation-form', defineCustomElement(ObservationForm))
}

async function get_styles() {
    const styles = [];
    const modules = import.meta.glob('./**/*.vue');

    for (const path in modules) {
        const mod = await modules[path]();
        styles.push(mod.default.styles);
    }

    return styles
}




