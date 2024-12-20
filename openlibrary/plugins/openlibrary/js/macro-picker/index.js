import { MacroPicker } from "./MacroPicker";

export function initMacroPicker(macroPickerElem) {
    const picker = new MacroPicker(macroPickerElem);
    picker.initialize()
}
