export const CAPABILITY_MANAGE_CMS_PAGES = 'manage_cms_pages'
export const CAPABILITY_MANAGE_CMS_CONTENT = 'manage_cms_content'
export const CAPABILITY_MANAGE_CMS_TEMPLATE = 'manage_cms_template'
export const CAPABILITY_VIEW_CMS_EDITOR = 'view_cms_editor'

export const DEFAULT_DATA_RESOLVER = `[
  {
    "track": {
      "event": "visit"
    }
  }
]`


export const DEFAULT_TEMPLATE = `{
  "$inlineEditor": {
    "allowDrop": true,
    "elementKey": "custom"
  },
  "p": {
    "data-element-key": "custom",
    "id": "page",
    "className": "page",
    "data-is-invisible": false
  },
  "c": [    
    {
      "$inlineEditor": {
        "allowDrop": true,
        "elementKey": "custom"
      },
      "p": {
        "data-element-key": "custom",
        "data-is-invisible": false,
        "id": "main",
        "className": "main"
      },
      "t": "div",
      "c": [
        {
          "t": "h1",
          "$inlineEditor": {
            "elementKey": "headline",
            "options": {
              "c": {
                "trKey": "genid_9axq0t4lu",
                "trContext": ""
              }
            }
          },
          "p": {
            "data-element-key": "headline"
          },
          "c": "Neue Seite"
        }
      ]
    }    
  ]
}`

export const DEFAULT_SCRIPT = `// 1. access scope data
// scope.page.slug
// scope.data
// 2. handle events
// on('click',(payload)=>{console.log})

on('beforerender',()=>{
\t// is called before the page renders\t
})

on('mount',()=>{
\t// this is called after rendering is completed and the page is ready
})

on('update',()=>{
\t// this is called when the page changed
})

on('unmount',()=>{
\t// this is called before the page gets destroyed
})

on('urlchange',()=>{
\t// this is called after the url changed
})

on('beforerunscript',()=>{
\t// this is called before the script is executed
})`

export const DEFAULT_STYLE = `//!#Basic
.page{
    img{
        max-width: 100%;
    }
    .entry{
        border-bottom: solid 1px #c1c1c1;
        padding-bottom:1rem;
        margin-bottom:2rem;
    }
}


//!#Grid
[data-element-key="grid"]{
\tdisplay:grid; 
  column-gap: 1rem;
  row-gap: 1rem;
  grid-template-columns: var(--grid-template-columns-xs);
}



.row {
\tdisplay: flex;
\tbox-sizing: border-box;
\tflex-wrap: wrap;
\tflex: 0 1 auto;
\tflex-direction: row;
\tmargin-right: -0.5rem;
\tmargin-left: -0.5rem;\t
  &.vcenter{
    align-items: center;
  }\t
\t&.eh{
\t\t.col{
\t\t\talign-self: stretch;\t\t\t\t
\t\t}
\t}
\t&.flex-end{
\t\talign-items: flex-end;
\t}
\t&.row-space-3{\t
\t\tmargin-left: -1.5rem;
\t\tmargin-right: -1.5rem;
\t\t> .col{
    \tpadding-bottom: 1.5rem;
\t\t\tpadding-right: 1.5rem;
\t\t\tpadding-left: 1.5rem;
\t\t}
\t}\t
\t&.row-space-4{\t
\t\tmargin-left: -2rem;
\t\tmargin-right: -2rem;
\t\t> .col{
\t\t\tpadding-right: 2rem;
\t\t\tpadding-left: 2rem;
\t\t}
\t} 
\t&.row-space-6{\t
\t\tmargin-left: -1.5rem;
\t\tmargin-right: -1.5rem;
\t\t> .col{
\t\t\tpadding-right: 1.5rem;
\t\t\tpadding-left: 1.5rem;
\t\t}
\t}
\t.col {    
    box-sizing: border-box;
    flex: 0 0 auto;
    padding-right: 0.5rem;
    padding-left: 0.5rem;
    padding-bottom: 1rem;
    width: 100%;
    position: relative;
\t\t&:empty{
\t\t\tpadding-bottom: 0;
\t\t}
    &.col-xs-1 {
      max-width: 8.3333333333%;
      flex: 0 0 8.3333333333%;
    }
    &.col-xs-2 {
      max-width: 16.6666666667%;
      flex: 0 0 16.6666666667%;
    }
    &.col-xs-3 {
      max-width: 25%;
      flex: 0 0 25%;
    }
    &.col-xs-4 {
      max-width: 33.3333333333%;
      flex: 0 0 33.3333333333%;
    }
    &.col-xs-5 {
      max-width: 41.6666666667%;
      flex: 0 0 41.6666666667%;
    }
    &.col-xs-6 {
      max-width: 50%;
      flex: 0 0 50%;
    }
    &.col-xs-7 {
      max-width: 58.3333333333%;
      flex: 0 0 58.3333333333%;
    }
    &.col-xs-8 {
      max-width: 66.6666666667%;
      flex: 0 0 66.6666666667%;
    }
    &.col-xs-9 {
      max-width: 75%;
      flex: 0 0 75%;
    }
    &.col-xs-10 {
      max-width: 83.3333333333%;
      flex: 0 0 83.3333333333%;
    }
    &.col-xs-11 {
      max-width: 91.6666666667%;
      flex: 0 0 91.6666666667%;
    }
    &.col-xs-12 {
      max-width: 100%;
      flex: 0 0 100%;
    }
    &.col-x{
      max-width: var(--width-xs);
      flex: 0 0 var(--width-xs);
    }
\t}
}

@media (min-width: \${scope.PageOptions && scope.PageOptions.breakpointMobile ? scope.PageOptions.breakpointMobile + 'px' : '25.813rem'}) {
  [data-element-key="grid"]{
    grid-template-columns: var(--grid-template-columns-sm);
  }
\t.row{\t
    &.row-space-6{\t
      margin-left: -1.5rem;
      margin-right: -1.5rem;
      > .col{
        padding-right: 1.5rem;
        padding-left: 1.5rem;
      }
    }
\t\t&.row-sm-reverse{
\t\t\tflex-direction: row-reverse;
\t\t}
\t\t.col{
\t\t\t&.col-sm-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
    \t}
\t\t\t&.col-sm-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
    \t}
\t\t\t&.col-sm-3 {
        max-width: 25%;
        flex: 0 0 25%;
    \t}
\t\t\t&.col-sm-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
    \t}
\t\t\t&.col-sm-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
   \t\t}
\t\t\t&.col-sm-6 {
        max-width: 50%;
        flex: 0 0 50%;
   \t \t}
\t\t\t&.col-sm-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
    \t}
\t\t\t&.col-sm-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
    \t}
\t\t\t&.col-sm-9 {
        max-width: 75%;
        flex: 0 0 75%;
    \t}
\t\t\t&.col-sm-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
    \t}
\t\t\t&.col-sm-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
    \t}
\t\t\t&.col-sm-12 {
        max-width: 100%;
        flex: 0 0 100%;
    \t}

\t\t\t&.col-sm-push{
        max-width: none;
        flex: 0 0 0%;
\t\t\t\tmargin-left: auto;
\t\t\t}
      &.col-x{
        max-width: var(--width-sm);
        flex: 0 0 var(--width-sm);
      }
\t\t}\t\t
\t}
}

@media (min-width: \${scope.PageOptions && scope.PageOptions.breakpointTablet ? scope.PageOptions.breakpointTablet + 'px' : '48rem'}) {
  [data-element-key="grid"]{
    grid-template-columns: var(--grid-template-columns-md);
  }
\t.row{
    &.row-space-6{\t
      margin-left: -2rem;
      margin-right: -2rem;
      > .col{
        padding-right: 2rem;
        padding-left: 2rem;
      }
    }
\t\t.col{
\t\t\t&.col-md-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
    \t}\t\t\t
\t\t\t&.col-md-1-5 {
        max-width: 20%;
        flex: 0 0 20%;
    \t}\t
\t\t\t&.col-md-3-5 {
        max-width: 60%;
        flex: 0 0 60%;
    \t}
\t\t\t&.col-md-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
    \t}
\t\t\t&.col-md-3 {
        max-width: 25%;
        flex: 0 0 25%;
    \t}
\t\t\t&.col-md-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
    \t}
\t\t\t&.col-md-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
   \t\t}
\t\t\t&.col-md-6 {
        max-width: 50%;
        flex: 0 0 50%;
   \t \t}
\t\t\t&.col-md-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
    \t}
\t\t\t&.col-md-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
    \t}
\t\t\t&.col-md-9 {
        max-width: 75%;
        flex: 0 0 75%;
    \t}
\t\t\t&.col-md-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
    \t}
\t\t\t&.col-md-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
    \t}
\t\t\t&.col-md-12 {
        max-width: 100%;
        flex: 0 0 100%;
    \t}
      &.col-x{
        max-width: var(--width-md);
        flex: 0 0 var(--width-md);
      }
\t\t}
\t}
}

@media (min-width: \${scope.PageOptions && scope.PageOptions.breakpointDesktop ? scope.PageOptions.breakpointDesktop + 'px' : '62rem'}) {
  [data-element-key="grid"]{
    grid-template-columns: var(--grid-template-columns-lg);
  }
\t.row{
    &.row-space-6{\t
      margin-left: -2.6rem;
      margin-right: -2.6rem;
      > .col{
        padding-right: 2.6rem;
        padding-left: 2.6rem;
      }
    }
\t\t.col{
\t\t\t&.col-lg-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
    \t}
\t\t\t&.col-lg-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
    \t}
\t\t\t&.col-lg-3 {
        max-width: 25%;
        flex: 0 0 25%;
    \t}
\t\t\t&.col-lg-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
    \t}
\t\t\t&.col-lg-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
   \t\t}
\t\t\t&.col-lg-6 {
        max-width: 50%;
        flex: 0 0 50%;
   \t \t}
\t\t\t&.col-lg-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
    \t}
\t\t\t&.col-lg-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
    \t}
\t\t\t&.col-lg-9 {
        max-width: 75%;
        flex: 0 0 75%;
    \t}
\t\t\t&.col-lg-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
    \t}
\t\t\t&.col-lg-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
    \t}
\t\t\t&.col-lg-12 {
        max-width: 100%;
        flex: 0 0 100%;
    \t}
      &.col-x{
        max-width: var(--width-lg);
        flex: 0 0 var(--width-lg);
      }
\t\t}
\t}
}
//!#Editor
//<!!#REMOVE
main[data-layout-content=true]{
\tbackground-color:#fff;
}

h1[data-isempty=true],
h2[data-isempty=true],
h3[data-isempty=true],
h4[data-isempty=true],
h5[data-isempty=true],
h6[data-isempty=true],
ul[data-isempty=true],
p[data-isempty=true],
a[data-isempty=true],
section[data-isempty=true],
div[data-isempty=true]{
\tmin-height:1rem;
\tdisplay:block;
\tcontent:'empty';
\tbackground: rgba(255,0,0,0.2);
}

[_inlineeditor=true]{\t
  &.row,
\t&[data-element-key="container"],
\t&[data-element-key="background"],
\t&[data-element-key="query"],
\t&[data-element-key="grid"],
\t&[data-element-key="custom"]{
\t\tpadding:0.5rem !important;
\t\tbackground: rgba(0,0,0,0.02);
\t\t> .col[_inlineeditor=true]{
\t\t\tborder:dashed 1px rgba(0,0,0,0.1);
\t\t}
\t}
  &[data-element-key="customElement"],
  &[data-element-key="custom"]{
    background: repeating-linear-gradient(
      135deg,
      rgba(255, 0, 0,0.05),
      rgba(255, 0, 0,0.05) 10px,
      transparent 10px,
      transparent 20px
    );
  }
  &[data-element-key="query"]{
  \tbackground: repeating-linear-gradient(
      45deg,
      rgba(0, 0, 0,0.1),
      rgba(0, 0, 0,0.1) 10px,
      transparent 10px,
      transparent 20px
    );
  }
  
  &[data-is-invisible="true"]{
    background-color: yellow;
  }
}

img[_inlineeditor=true]{
\tmin-width:1rem;
\tmin-height:1rem;
}
//!!#REMOVE>

[data-is-invisible="true"]:not([_inlineeditor=true]){
  display:none !important; 
}
`
