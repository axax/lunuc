import {MatchDecorator, ViewPlugin, Decoration} from '@codemirror/view'

let customDeco = Decoration.mark({class: 'cm-custom'}) // This adds a className to the text that matches the regex.
let decorator = new MatchDecorator({
    regexp: /(\b__this|\"\$[a-zA-Z]*\"|\bserverMethod|\b_app_|\brequire(?=\()|\brequireAsync|\bfetchMore|\baddMetaTag|\bsetStyle|\bclientQuery|\bon(?=\()|\bUtil|\bDomUtil|\bscope|\bhistory|\brefresh|\bforceUpdate|\bgetLocal|\bsetLocal|\bparent|\broot|\bgetComponent|\bupdateResolvedData|\bsetKeyValue|\bgetKeyValue|\bgetKeyValueGlobal)/g,
    decoration: (m, x) => {
        return customDeco
    },
});

export const keywordDecorator = ViewPlugin.define(
    (view) => ({
        decorations: decorator.createDeco(view),
        update(u) {
            this.decorations = decorator.updateDeco(u, this.decorations);
        },
    }),
    {
        decorations: (v) => v.decorations,
    }
);