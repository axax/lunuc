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
\${this.set('breakpointMobile',scope?.PageOptions?.breakpointMobile ? scope.PageOptions.breakpointMobile + 'px' : '25.813rem')}
\${this.set('breakpointTablet',scope?.PageOptions?.breakpointTablet ? scope.PageOptions.breakpointTablet + 'px' : '48rem')}
\${this.set('breakpointDesktop',scope?.PageOptions?.breakpointDesktop ? scope.PageOptions.breakpointDesktop + 'px' : '62rem')}

:root{
    --color-grey: \${scope?.PageOptions?.grey || '#c1c1c1'};
    
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
  .relative{
    position: relative;
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
      width:calc(var(--breakpoint-mobile) + 12rem);
    }    
    .indented-small{
      width:var(--breakpoint-tablet);
    }
    .indented-large{
      width:calc(var(--breakpoint-desktop) + 24rem);
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
  display: grid;
  // This sets up a n-column grid by default (mobile-first).
  grid-template-columns: repeat(\${this.get('numberOfGridColumns')}, 1fr);
  
  gap: 1rem; // Default row and column gap
  box-sizing: border-box;
  &.vcenter {
    align-items: center;
  }
  &.eh {
    > .col { // Using direct child selector for specificity
      align-self: stretch;
    }
  }
  &.flex-end {
    align-items: flex-end;
  }

  &.row-sm-reverse {
    direction: rtl; /* reverse item order */
  }

  .col {
    direction: ltr; /* keep content text direction normal */
    box-sizing: border-box;
    position: relative;
    // Default to full width on mobile by spanning all n columns.
    grid-column: span \${this.get('numberOfGridColumns')};

    \${Array(this.get('numberOfGridColumns')).fill().map((_,i) => \`
      &.col-xs-\${i+1} { grid-column: span \${i+1}; }
    \`)}

    &.col-x {
      // This custom property now needs to be a span number, e.g., --grid-span-xs: 4;
      grid-column: span var(--grid-span-xs, \${this.get('numberOfGridColumns')});
    }
  }
}

// --- MEDIA QUERIES ---

@media (min-width: \${this.get('breakpointMobile')}) {
  .row {    
    &.row-space-4 {
      gap: 2rem;
    }
    &.row-space-6 {
      column-gap: 3rem;
    }
    &.row-sm-reverse {
      direction: ltr; /* reverse item order */
    }
    .col {
      \${Array(this.get('numberOfGridColumns')).fill().map((_,i) => \`
        &.col-sm-\${i+1} { grid-column: span \${i+1}; }
      \`)}
      &.col-x {
        grid-column: span var(--grid-span-sm, \${this.get('numberOfGridColumns')});
      }
    }
  }
}

@media (min-width: \${this.get('breakpointTablet')}) {
  .row {    
    &.row-space-4 {
      gap: 3rem;
    }
    &.row-space-6 {
      column-gap: 4rem;
    }
    .col {
      \${Array(this.get('numberOfGridColumns')).fill().map((_,i) => \`
        &.col-md-\${i+1} { grid-column: span \${i+1}; }
      \`)}
      &.col-x {
        grid-column: span var(--grid-span-md, \${this.get('numberOfGridColumns')});
      }
    }
  }
}

@media (min-width: \${this.get('breakpointDesktop')}) {
  .row {
    &.row-space-6 {
      column-gap: 5.2rem;
    }
    .col {
      \${Array(this.get('numberOfGridColumns')).fill().map((_,i) => \`
        &.col-lg-\${i+1} { grid-column: span \${i+1}; }
      \`)}

      &.col-x {
        grid-column: span var(--grid-span-lg, \${this.get('numberOfGridColumns')});
      }
    }
  }
}
//!#Slider
[data-element-key='slider'] {
  --slide-count:1;
  --arrownav-height: calc(2.5rem + 2vh);
  overflow: hidden;
  margin-bottom:2rem;
  position:relative;

  /* for nav bottom*/
  padding-bottom: calc(var(--arrownav-height) * 1.6);

  > input {
    display: none;
    \${Array(20).fill().map((item, i) => \`
    &:nth-of-type(\${i+1}):checked {
      ~ ul > li {
        transform:translateX(calc(-\${i} * 100%));
        &:nth-of-type(\${i+1}) {
          z-index:1
        }
      }
      ~ .arrownav {
        > .slide-count:nth-of-type(\${i+1}){
          display:block;
        }
        > label:nth-of-type(\${i*2+1}) {
          display:block;
          left:calc(-2.2rem + -1.6vw);
        }
        > label:nth-of-type(\${i*2+2}) {
          display:block;
          transform: rotate(180deg);
          right:calc(-2.2rem + -1.6vw);
        }
      }
    }
    \`).join('')}
  }
  > ul {
    min-height: 2rem;
    position:relative;
    list-style:none;
    margin:0;
    padding:0;
    > li {
      width:calc(100% / var(--slide-count));
      top:0;
      position:absolute;
      transition: transform 0.3s;
      &:first-child{
        position:relative;
      }
      > img,
      > figure,
      > a{
        display:block;
        position:relative;
        width: 100%;
        height:auto;
        margin:0;
        text-decoration:none;
      }
      > img,
      > a,
      > a > figure,
      > figure{
        margin:0;
        > img{
          display: block;
          width: 100%;
        }
        > figcaption{
        }
      }
    }
  }
  > nav{
    display:none;
  }
  > .arrownav{
    position:absolute;
    z-index:2;
    top:calc(100% - var(--arrownav-height));
    right: 2vw;
    height:var(--arrownav-height);
    border: solid 1px #000000;      
    border-radius: calc(var(--arrownav-height) / 2.25);
    display: flex;
    align-items: center;
    background-color: #ffffff;
    > .slide-count{
      display:none;    
      letter-spacing: 1px;
    }
    > label{
      display:none;
      border: solid 1px --var(--color-grey);
      height:calc(100% - 0.5rem);
      width: calc(var(--arrownav-height) - 0.5rem);
      margin: 0.5rem;
      cursor:pointer;
      border:none;
      border-radius: 50%;
      background-color:transparent;
      background-repeat: no-repeat;
      background-position: center center;
      background-size: calc(var(--arrownav-height) * 0.4);
      background-image: url("/icons/arrow-left.svg");
      transition: background var(--transition-duration) linear;
      &:hover{
        background-color:var(--color-main);
      }
    }
  }
}
//!#Editor
//<!!#REMOVE
main[data-layout-content=true]{
  background-color:#fff;
}
[data-force-inline-editor=true]{
  padding:0.75rem;
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
  &[data-element-key="richText"]{
    padding-left: 1px;
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