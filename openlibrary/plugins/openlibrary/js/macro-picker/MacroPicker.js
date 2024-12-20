// imported functions and their dependencies:
export class MacroPicker {
    constructor(rootElem) {
        this.root = rootElem
        this.picker = this.root.querySelector('.macro-picker')
        this.selectButton = this.picker.querySelector('button')
        this.macroFormDialog = this.root.querySelector('#macro-builder-ui')
        this.selector = this.macroFormDialog.querySelector('#macro-list')
        this.macroUiCancelButton = this.macroFormDialog.querySelector('.cancel-button')
        this.macroUiInsertButton = this.macroFormDialog.querySelector('button')
        this.macroUiInputs = this.macroFormDialog.querySelector('.macro-arguments')
        this.macroUiNameDisplay = this.macroFormDialog.querySelector('.macro-name')
        this.macroUiDescDisplay = this.macroFormDialog.querySelector('.macro-description')
        this.macroFormInputs = this.macroFormDialog.querySelector('.form-inputs')
        const textareaSelector = '#' + this.root.dataset.textareaId
        this.textarea = document.querySelector(textareaSelector)
        this.selectedOptionData = null
    }

    initialize() {
        this.selectButton.addEventListener('click', () => {
            this.toggleUI()
        })

        this.macroUiCancelButton.addEventListener('click', () => {
            this.toggleUI()
        })

        this.macroUiInsertButton.addEventListener('click', () => {
            if (this.isSelectionValid()) {
                const inlineMacroString = this.generateMacroString()
                this.insertIntoTextarea(inlineMacroString)
                this.toggleUI()
                this.resetUI(true)
                this.textarea.focus()
            }
        })

        this.selector.addEventListener("change", () => {
            if (this.isSelectionValid()) {
                const selectedOption = this.selector.options[this.selector.selectedIndex]
                this.selectedOptionData = JSON.parse(selectedOption.dataset.option)
                this.updateUI(this.selectedOptionData)
            } else {
                this.resetUI(true)
            }
        })

        this.selector.selectedIndex = 0  // Resets selector when page is refreshed
    }

    /**
     * Returns `true` if the selected index of the macro selector is not `0`.
     *
     * @returns {boolean}
     */
    isSelectionValid() {
        return Boolean(this.selector.selectedIndex)
    }

    updateUI(data) {
        this.resetUI()
        this.macroUiNameDisplay.innerText = data.displayName
        this.macroUiDescDisplay.innerText = data.description
        console.log(this.macroUiInputs)
        for (const arg of data.args) {
            this.macroUiInputs.appendChild(this.createInput(arg))
        }
        for (const kwarg of data.kwargs) {
            this.macroUiInputs.appendChild(this.createInput(kwarg))
        }
        this.macroFormInputs.classList.remove('hidden')
    }

    createInput(inputOptions) {
        const templateElem = document.createElement('template')
        const htmlTemplate = `<label>
            ${inputOptions.displayName} ${inputOptions.required ? '(required)' : ''}
            <input ${inputOptions.required ? '' : 'data-keyword="true" '}
            type="${inputOptions.inputType}" 
            name="${inputOptions.name}"
            > ${inputOptions.description}
            </label>`
        templateElem.insertAdjacentHTML('afterbegin', htmlTemplate)
        return templateElem.firstChild
    }

    toggleUI() {
        if (this.macroFormDialog.open) {
            this.macroFormDialog.close()
        } else {
            this.macroFormDialog.show()
        }
    }

    resetUI(resetSelected=false) {
        Array.from(this.macroUiInputs.children).forEach((elem) => {
            elem.remove()
        })
        this.macroUiNameDisplay.innerText = ''
        this.macroUiDescDisplay.innerText = ''
        if (resetSelected) {
            this.selector.selectedIndex = 0
            this.selectedOptionData = null
        }
        this.macroFormInputs.classList.add('hidden')
    }

    generateMacroString() {
        const cacheCheckbox = this.macroFormDialog.querySelector('#cache-checkbox')
        const argStrings = []
        let result = "{{"
        if (cacheCheckbox.checked) {
            result += 'CacheableMacro'
            let cachedMacroArg = '"'
            cachedMacroArg += this.selectedOptionData.name
            cachedMacroArg += '"'
            argStrings.push(cachedMacroArg)
        } else {
            result += this.selectedOptionData.name
        }

        result += "("

        const inputs = this.macroUiInputs.querySelectorAll("input");
        for (const input of inputs) {
            let argString = ''
            if (!input.dataset.required) {
                argString += input.name
                argString += "="
            }
            argString += this.renderParam(input)
            argStrings.push(argString)
        }
        result += argStrings.join(', ')
        result += ")}}\n\n";
        return result
    }

    renderParam(input) {
        let result = ""
        switch (input.type) {
            case "text":
                result = `"${input.value}"`
                break
            case "number":
                result = input.value
                break
            case "checkbox":
                result = input.checked ? 'True' : 'False'
                break
        }
        return result
    }

    insertIntoTextarea(str) {
        this.textarea.value += str
    }
}
