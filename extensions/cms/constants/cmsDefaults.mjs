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
export const DEFAULT_STYLE = `//!#Environment
\${this.set('breakpointMobile',scope.PageOptions && scope.PageOptions.breakpointMobile ? scope.PageOptions.breakpointMobile + 'px' : '25.813rem')}
\${this.set('breakpointTablet',scope.PageOptions && scope.PageOptions.breakpointTablet ? scope.PageOptions.breakpointTablet + 'px' : '48rem')}
\${this.set('breakpointDesktop',scope.PageOptions && scope.PageOptions.breakpointDesktop ? scope.PageOptions.breakpointDesktop + 'px' : '62rem')}

:root{
    --breakpoint-mobile:\${this.get('breakpointMobile')};
    --breakpoint-tablet:\${this.get('breakpointTablet')};
    --breakpoint-desktop:\${this.get('breakpointDesktop')};
    
    --grid-template-columns-xs:1;
    --grid-template-columns-sm:2;
    --grid-template-columns-md:3;
    --grid-template-columns-lg:4;
    
    --width-xs: 100%;
    --width-sm: 50%;
    --width-md: 33.33%;
    --width-lg: 25%;
}

//!#Custom
#page{
  img{
    max-width: 100%;
  }
  .entry{
    border-bottom: solid 1px #c1c1c1;
    padding-bottom:1rem;
    margin-bottom:2rem;
  }
}
//!#General
html,body{
  margin:0;
  padding:0;
}
*, *:before, *:after {
  box-sizing: border-box;
}
#page{
  img{
    max-width:100%;
  }
  .strong{
    font-weight: bold;
  }
  .indented,
  .indented-small,
  .indented-large{
    overflow: auto;
    display:block;
    max-width:100%;
    width: 100%;
    padding: 0 1rem;
    margin:0 auto;
  }
  
  .animation {
    opacity: 0;
    transform: translateY(30px) scale(0.9);
    transform-origin: top;
    transition: opacity 1s, transform 1s;
  }
  .fade-in-up {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@media screen and (max-width: \${this.get('breakpointTablet')}){
  #page{
    .hide-mobile{
      display:none;
    }
  }
}
@media screen and (min-width: \${this.get('breakpointDesktop')}){
  /* large desktop */
  #page{
    .indented{
      width:\${this.get('breakpointDesktop') + 12rem};
    }    
    .indented-small{
      width:calc(\${this.get('breakpointDesktop')});
    }
    .indented-large{
      width:calc(\${this.get('breakpointDesktop')} + 24rem);
    }
  }
}

//!#Grid
[data-element-key="grid"]{
  display:grid;
  column-gap: 1rem;
  row-gap: 1rem;
  grid-template-columns: var(--grid-template-columns-xs);
}
.row {
  display: flex;
  box-sizing: border-box;
  flex-wrap: wrap;
  flex: 0 1 auto;
  flex-direction: row;
  margin-right: -0.5rem;
  margin-left: -0.5rem;
  &.vcenter{
    align-items: center;
  }
  &.eh{
    .col{
      align-self: stretch;
    }
  }
  &.flex-end{
    align-items: flex-end;
  }
  &.row-space-3{
    margin-left: -1.5rem;
    margin-right: -1.5rem;
    > .col{
      padding-bottom: 1.5rem;
      padding-right: 1.5rem;
      padding-left: 1.5rem;
    }
  }
  &.row-space-4{
    margin-left: -2rem;
    margin-right: -2rem;
    > .col{
      padding-right: 2rem;
      padding-left: 2rem;
    }
  }
  &.row-space-6{
    margin-left: -1.5rem;
    margin-right: -1.5rem;
    > .col{
      padding-right: 1.5rem;
      padding-left: 1.5rem;
    }
  }
  .col {
    box-sizing: border-box;
    flex: 0 0 auto;
    padding-right: 0.5rem;
    padding-left: 0.5rem;
    padding-bottom: 1rem;
    width: 100%;
    position: relative;
    &:empty{
      padding-bottom: 0;
    }
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
  }
}
@media (min-width: \${this.get('breakpointMobile')}) {
  [data-element-key="grid"]{
    grid-template-columns: var(--grid-template-columns-sm);
  }
  .row{
    &.row-space-6{
      margin-left: -1.5rem;
      margin-right: -1.5rem;
      > .col{
        padding-right: 1.5rem;
        padding-left: 1.5rem;
      }
    }
    &.row-sm-reverse{
      flex-direction: row-reverse;
    }
    .col{
      &.col-sm-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
      }
      &.col-sm-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
      }
      &.col-sm-3 {
        max-width: 25%;
        flex: 0 0 25%;
      }
      &.col-sm-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
      }
      &.col-sm-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
      }
      &.col-sm-6 {
        max-width: 50%;
        flex: 0 0 50%;
      }
      &.col-sm-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
      }
      &.col-sm-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
      }
      &.col-sm-9 {
        max-width: 75%;
        flex: 0 0 75%;
      }
      &.col-sm-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
      }
      &.col-sm-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
      }
      &.col-sm-12 {
        max-width: 100%;
        flex: 0 0 100%;
      }
      &.col-sm-push{
        max-width: none;
        flex: 0 0 0%;
        margin-left: auto;
      }
      &.col-x{
        max-width: var(--width-sm);
        flex: 0 0 var(--width-sm);
      }
    }
  }
}
@media (min-width: \${this.get('breakpointTablet')}) {
  [data-element-key="grid"]{
    grid-template-columns: var(--grid-template-columns-md);
  }
  .row{
    &.row-space-6{
      margin-left: -2rem;
      margin-right: -2rem;
      > .col{
        padding-right: 2rem;
        padding-left: 2rem;
      }
    }
    .col{
      &.col-md-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
      }
      &.col-md-1-5 {
        max-width: 20%;
        flex: 0 0 20%;
      }
      &.col-md-3-5 {
        max-width: 60%;
        flex: 0 0 60%;
      }
      &.col-md-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
      }
      &.col-md-3 {
        max-width: 25%;
        flex: 0 0 25%;
      }
      &.col-md-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
      }
      &.col-md-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
      }
      &.col-md-6 {
        max-width: 50%;
        flex: 0 0 50%;
      }
      &.col-md-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
      }
      &.col-md-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
      }
      &.col-md-9 {
        max-width: 75%;
        flex: 0 0 75%;
      }
      &.col-md-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
      }
      &.col-md-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
      }
      &.col-md-12 {
        max-width: 100%;
        flex: 0 0 100%;
      }
      &.col-x{
        max-width: var(--width-md);
        flex: 0 0 var(--width-md);
      }
    }
  }
}
@media (min-width: \${this.get('breakpointDesktop')}) {
  [data-element-key="grid"]{
    grid-template-columns: var(--grid-template-columns-lg);
  }
  .row{
    &.row-space-6{
      margin-left: -2.6rem;
      margin-right: -2.6rem;
      > .col{
        padding-right: 2.6rem;
        padding-left: 2.6rem;
      }
    }
    .col{
      &.col-lg-1 {
        max-width: 8.3333333333%;
        flex: 0 0 8.3333333333%;
      }
      &.col-lg-2 {
        max-width: 16.6666666667%;
        flex: 0 0 16.6666666667%;
      }
      &.col-lg-3 {
        max-width: 25%;
        flex: 0 0 25%;
      }
      &.col-lg-4 {
        max-width: 33.3333333333%;
        flex: 0 0 33.3333333333%;
      }
      &.col-lg-5 {
        max-width: 41.6666666667%;
        flex: 0 0 41.6666666667%;
      }
      &.col-lg-6 {
        max-width: 50%;
        flex: 0 0 50%;
      }
      &.col-lg-7 {
        max-width: 58.3333333333%;
        flex: 0 0 58.3333333333%;
      }
      &.col-lg-8 {
        max-width: 66.6666666667%;
        flex: 0 0 66.6666666667%;
      }
      &.col-lg-9 {
        max-width: 75%;
        flex: 0 0 75%;
      }
      &.col-lg-10 {
        max-width: 83.3333333333%;
        flex: 0 0 83.3333333333%;
      }
      &.col-lg-11 {
        max-width: 91.6666666667%;
        flex: 0 0 91.6666666667%;
      }
      &.col-lg-12 {
        max-width: 100%;
        flex: 0 0 100%;
      }
      &.col-x{
        max-width: var(--width-lg);
        flex: 0 0 var(--width-lg);
      }
    }
  }
}
//!#Editor
//<!!#REMOVE
main[data-layout-content=true]{
  background-color:#fff;
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
  min-height:1rem;
  display:block;
  content:'empty';
  background: rgba(255,0,0,0.2);
}
[_inlineeditor=true]{
  &.row,
  &[data-element-key="container"],
  &[data-element-key="background"],
  &[data-element-key="query"],
  &[data-element-key="grid"],
  &[data-element-key="custom"]{
    padding:0.5rem !important;
    background: rgba(0,0,0,0.02);
    > .col[_inlineeditor=true]{
      border:dashed 1px rgba(0,0,0,0.1);
    }
  }
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
    background: repeating-linear-gradient(
    45deg,
    rgba(0, 0, 0,0.1),
    rgba(0, 0, 0,0.1) 10px,
    transparent 10px,
    transparent 20px
    );
  }
  &[data-is-invisible="true"]{
    background-color: yellow !important;
  }
}
img[_inlineeditor=true]{
  min-width:1rem;
  min-height:1rem;
}
//!!#REMOVE>
[data-is-invisible="true"]:not([_inlineeditor=true]){
  display:none !important;
}
`