export const CAPABILITY_MANAGE_CMS_PAGES = 'manage_cms_pages'
export const CAPABILITY_MANAGE_CMS_CONTENT = 'manage_cms_content'
export const CAPABILITY_MANAGE_CMS_TEMPLATE = 'manage_cms_template'
export const CAPABILITY_MANAGE_OTHER_USERS = 'manage_other_users'

export const DEFAULT_DATA_RESOLVER = `[
  {
    "track": {
      "event": "visit"
    }
  }
]`


export const DEFAULT_TEMPLATE = `[
  {
    "t": "div.page",
    "c": [
      {
        "t": "h1",
        "$inlineEditor": {
          "elementKey": "headline",
          "options": {
            "c": {
              "trKey": "genid_40yjkwyge"
            }
          }
        },
        "p": {
          "data-element-key": "headline"
        },
        "c": "Page"
      }
    ]
  }
]`

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
  
}


//!#Grid
.row {
\tdisplay: flex;
\tbox-sizing: border-box;
\tflex-wrap: wrap;
\tflex: 0 1 auto;
\tflex-direction: row;
\tmargin-right: -0.5rem;
\tmargin-left: -0.5rem;
\t
\t
\t&.vcenter{
\t\talign-items: center;
\t}\t
  
\t&.row-reverse{
\t\tflex-direction: row-reverse;
\t}

\t&.equal-height-mobile{
\t\t.col{
\t\t\tline-height:0;
\t\t\theight:100%;\t\t\t\t
\t\t}
\t\timg{
\t\t\theight: 100%;
\t\t\twidth: 100%;
\t\t\tobject-fit: cover;
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
\t}
\t
\t&.row-space-4{\t
\t\tmargin-left: -2rem;
\t\tmargin-right: -2rem;
\t\t> .col{
\t\t\tpadding-right: 2rem;
\t\t\tpadding-left: 2rem;
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
\t}
\t
\t
\t&.grid{

\t\tposition:relative;
\t\t&:after,&:before{
\t\t\tcontent: ' ';
\t\t\tposition:absolute;
\t\t\tbackground:white;
\t\t\tdisplay:block;
\t\t\tz-index:1;
\t\t}
\t\t&:after{
\t\t\tright:0;
\t\t\ttop:0;
\t\t\tbottom:0;
\t\t\twidth:3px;\t\t\t\t
\t\t}
\t\t&:before{
\t\t\tright:0;
\t\t\tleft:0;
\t\t\tbottom:0;
\t\t\theight:3px;\t\t\t\t
\t\t}
\t\t.col {
\t\t\tborder-bottom:solid 1px black;
\t\t\tpadding-top: 2rem;
\t\t\tborder-right:solid 1px black;\t\t\t
\t\t}
\t\t
\t}
}

@media (min-width: 23.4375rem) {
\t.row{
\t\t.col{
\t\t\t&.col-xs-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
    \t}
\t\t\t&.col-xs-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
    \t}
\t\t\t&.col-xs-3 {
        max-width: 25%;
        flex: 0 0 25%;
    \t}
\t\t\t&.col-xs-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
    \t}
\t\t\t&.col-xs-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
   \t\t}
\t\t\t&.col-xs-6 {
        max-width: 50%;
        flex: 0 0 50%;
   \t \t}
\t\t\t&.col-xs-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
    \t}
\t\t\t&.col-xs-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
    \t}
\t\t\t&.col-xs-9 {
        max-width: 75%;
        flex: 0 0 75%;
    \t}
\t\t\t&.col-xs-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
    \t}
\t\t\t&.col-xs-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
    \t}
\t\t\t&.col-xs-12 {
        max-width: 100%;
        flex: 0 0 100%;
    \t}
\t\t}
\t}
}

@media (min-width: 48rem) {
\t.row{\t
\t\t&.equal-height{
\t\t\t.col{
\t\t\t\tline-height:0;
\t\t\t\theight:100%;\t\t\t\t
\t\t\t}
\t\t\timg{
\t\t\t\theight: 100%;
\t\t\t\twidth: 100%;
\t\t\t\tobject-fit: cover;
\t\t\t}
\t\t\t&.h25{\t\t\t
\t\t\t\theight:25rem;
\t\t\t}
\t\t\t&.h30{\t\t\t
\t\t\t\theight:30rem;
\t\t\t}
\t\t\t&.h35{\t\t\t
\t\t\t\theight:35rem;
\t\t\t}
\t\t\t&.h40{\t\t\t
\t\t\t\theight:40rem;
\t\t\t}
\t\t}
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
\t\t}
\t\t
\t}
}

@media (min-width: 62rem) {
\t.row{
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
\t\t}
\t}
}

@media (min-width: 75rem) {
\t.row{
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
\t\t}
\t}
}

@media (min-width: 93.75rem) {
\t.row{
\t\t.col{
\t\t\t&.col-xl-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
    \t}
\t\t\t&.col-xl-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
    \t}
\t\t\t&.col-xl-3 {
        max-width: 25%;
        flex: 0 0 25%;
    \t}
\t\t\t&.col-xl-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
    \t}
\t\t\t&.col-xl-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
   \t\t}
\t\t\t&.col-xl-6 {
        max-width: 50%;
        flex: 0 0 50%;
   \t \t}
\t\t\t&.col-xl-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
    \t}
\t\t\t&.col-xl-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
    \t}
\t\t\t&.col-xl-9 {
        max-width: 75%;
        flex: 0 0 75%;
    \t}
\t\t\t&.col-xl-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
    \t}
\t\t\t&.col-xl-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
    \t}
\t\t\t&.col-xl-12 {
        max-width: 100%;
        flex: 0 0 100%;
    \t}
\t\t}
\t}
}
//!#Editor
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
\tbackground-color: rgba(255,0,0,0.2);
}

[_inlineeditor=true]{\t
\t&.row,&[data-element-key="container"],
\t&[data-element-key="background"],
\t&[data-element-key="custom"]{
\t\tpadding:0.5rem;
\t\tposition:relative;
\t\t&:after{
\t\t\tdisplay:block;
\t\t\tcontent:'';
\t\t\tposition:absolute;
\t\t\ttop:0;
\t\t\tleft:0;
\t\t\tright:0;
\t\t\tbottom:0;
\t\t\tbackground-color: rgba(0,0,0,0.02);
\t\t\tpointer-events:none;
\t\t}
\t\t> .col[_inlineeditor=true]{
\t\t\tborder:dashed 1px rgba(0,0,0,0.1);
\t\t}
\t}
}

img[_inlineeditor=true]{
\tmin-width:1rem;
\tmin-height:1rem;
}
`
