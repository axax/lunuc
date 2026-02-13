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
export const DEFAULT_SCRIPT = `//!#main
// 1. access scope data
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
})
//!#General
scope.notouch = !('ontouchstart' in window || navigator.maxTouchPoints)
const onScroll=()=>{
  if( !scope.editMode && !scope.inEditor ){
    const el = document.body, cn = 'is-scroll'
    if (el && el.classList) {
      const co = window.pageYOffset      
      if (co>100 ){
        el.classList.add(cn)
      }else{
        el.classList.remove(cn)
      }
    }
  }
}
let resizeTimeout
let prevWindowWidth = window.innerWidth
const onResize =(e) => {
  if(window.innerWidth !== prevWindowWidth){
    prevWindowWidth = window.innerWidth
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(()=>{
      root.refresh(true)
    },250)
  }
}
on('mount',()=>{
  window.addEventListener('scroll',onScroll)
  window.addEventListener('resize',onResize)
})
on('unmount',()=>{
  window.removeEventListener('scroll',onScroll)
  window.removeEventListener('resize',onResize)
})
//!#Slider
/*slider */
on('mount',()=>{
  waitForSlider()
})

let isWaitingForSlider = false
const waitForSlider = () => {
  if(!isWaitingForSlider){
    isWaitingForSlider = true
    DomUtil.waitForElement('[data-element-key="slider"]:not([data-has-started="true"])').then((el)=>{
      isWaitingForSlider = false
      startSliders()
      setTimeout(()=>{
        waitForSlider()
      },2000)
    }).catch(()=>{
      isWaitingForSlider = false
      setTimeout(()=>{
        waitForSlider()
      },2000)
    })
  }
}

const getElementIndex = (node) => {
  var index = 0;
  if(node){
    while ( (node = node.previousElementSibling) ) {
      index++
    }
  }
  return index
}
const sliderClick =(e)=>{
  let node = e.target, timeoutId, timeout
  while ( !timeoutId && node && node.getAttribute) {
    timeoutId = node.getAttribute('data-timeout-id')
    if(!timeoutId){
      node = node.parentNode
    }
  }
  if(!node || !node.getAttribute){
    return
  }
  if(node.getAttribute('data-click')){
    node.setAttribute('data-click','')
    return
  }
  startSlider(node)
}
const findSlider = (child)=>{
  while(child && child.getAttribute('data-element-key')!=='slider'){
    child  = child.parentNode
  }
  return child
}
const sliderTouch = (e) =>{
  const slider = findSlider(e.target)
  slider.setAttribute('data-timeout-touchstartx', e.changedTouches[0].screenX)
  slider.setAttribute('data-timeout-touchstarty', e.changedTouches[0].screenY)
}
const sliderTouchEnd = (e) => {
  const slider = findSlider(e.target)
  const slides = slider.querySelectorAll('input')
  const slide=slider.querySelector('input:checked')
  let slideIdx = getElementIndex(slide)
  const touchendX = e.changedTouches[0].screenX
  const touchendY = e.changedTouches[0].screenY
  const touchstartX = slider.getAttribute('data-timeout-touchstartx')
  const touchstartY = slider.getAttribute('data-timeout-touchstarty')
  let direction = ''
  const delx = touchendX - touchstartX
  const dely = touchendY - touchstartY
  if(Math.abs(delx) > Math.abs(dely)){
    if(delx > 0) {
      slideIdx--
      if(slideIdx < 0){
        slideIdx = slides.length - 1
      }
    }else{
      slideIdx++
      if(slideIdx >= slides.length){
        slideIdx = 0
      }
    }
    console.log(slideIdx, slides)
    clearTimeout(slider.getAttribute('data-timeout-id'))
    slides[slideIdx].click()    
  }
}
const startSlider = (slider) => {
  if(slider){
    slider.removeEventListener('click',sliderClick)
    slider.addEventListener('click',sliderClick)
    clearTimeout(slider.getAttribute('data-timeout-id'))
    
    const slide=slider.querySelector('input:checked')
    
    let timeout = parseInt(slide.getAttribute('data-slide-timeout'))

    if(isNaN(timeout)){
      timeout = parseInt(slider.getAttribute('data-slide-timeout'))
    }
    
    if(!isNaN(timeout) && timeout>0){
      const slides = slider.querySelectorAll('input')
      if(slides.length>1){
        let idx = getElementIndex(slide)
        idx++
        if(idx>=slides.length){
          idx = 0
        }
        const timeoutId= setTimeout(()=>{
          slides[idx].click()
        },timeout)
        slider.setAttribute('data-timeout-id', timeoutId)
      }
    }
    
    /* swipe */
    slider.removeEventListener('touchstart', sliderTouch, false)
    slider.addEventListener('touchstart', sliderTouch, false)
    slider.removeEventListener('touchend', sliderTouchEnd , false)
    slider.addEventListener('touchend', sliderTouchEnd , false)
  }
}
const startSliders = (currentSlider) => {
  const sliders = document.querySelectorAll('[data-element-key="slider"]')
  if( sliders && sliders.forEach){
    for(let i = 0; i< sliders.length; i++){
      const slider = sliders[i]
      if(!slider.getAttribute('data-has-started')){
        slider.setAttribute('data-has-started', true)
        startSlider(slider)
      }
    }
  }
}
/* end slider */`

export const DEFAULT_STYLE = `//!#Environment
\${this.set('numberOfGridColumns', scope?.PageOptions?.numberOfGridColumns || 12)}
\${this.set('defaultFontFamily',scope?.PageOptions?.defaultFontFamily || 'FunnelDisplay')}
\${this.set('breakpointMobile',scope?.PageOptions?.breakpointMobile ? scope.PageOptions.breakpointMobile + 'px' : '768px')}
\${this.set('breakpointTablet',scope?.PageOptions?.breakpointTablet ? scope.PageOptions.breakpointTablet + 'px' : '1024px')}
\${this.set('breakpointDesktop',scope?.PageOptions?.breakpointDesktop ? scope.PageOptions.breakpointDesktop + 'px' : '1540px')}

:root{
    --default-font-size: calc(0.9rem + 0.2vw);
    --default-font-color: rgb(0,0,0);
    --default-font-family: \${this.get('defaultFontFamily')}, serif;
    --default-transition-duration:0.25s;
  
    --color-main: \${scope?.PageOptions?.main || 'rgb(17, 95, 105)'};
    --color-main-dark: color-mix(in oklab, var(--color-main), black 30%);
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
//!#General
#page{

  /* Default font settings */
  line-height:1.4;
  font-display: swap;
  font-family: var(--default-font-family);
  font-size: var(--default-font-size);
  color: var(--default-font-color);

  p,h1,.h1,h2,.h2,h3,.h3,h4,.h4,h5,.h5,h6,.h6{
    margin-top: 0;
    font-weight: 200;
  }
  h1,.h1{
    font-size: calc(var(--default-font-size) * 4);
    line-height: 1.2;
    margin-top:0;
    margin-bottom: calc(2rem + 1.5vh);
  }
  h2,.h2{
    font-size: calc(var(--default-font-size) * 2);
    line-height: 1.2;
    margin-bottom: calc(1.5rem + 1vh);
  }
  h3,.h3{
    font-size: calc(var(--default-font-size) * 1.2);
    line-height: 1.2;
    margin-bottom: calc(1rem + 0.5vh);
  }

  img{
    max-width:100%;
    height:auto;
  }

  //<!!#EXTRACT_CLASSES
  .smaller{
    font-size: calc(var(--default-font-size) * 0.85);
  }
  strong, .strong{
    font-weight: bold;
  }
  .center{
    text-align: center;
  }
  
  a.link-animation,
  .link-animation a{
    text-decoration:none;
    position: relative;
    color: var(--default-font-color);
    &:after {
      transform: scaleX(0);
      content: '';
      display: block;
      position: absolute;
      height:2px;
      top: 100%;
      left:0;
      right:0;
      background-color: var(--default-font-color);
      transition: transform var(--default-transition-duration) ease;
    }
    &:hover{
      &:after {
        transform: scaleX(1);
        background-color: var(--default-font-color);
      }
    }
  }
  //!!#EXTRACT_CLASSES>
  .fade-in {
    opacity: 0;
    transform-origin: center center;
    transition: opacity calc(var(--default-transition-duration) * 4), transform calc(var(--default-transition-duration) * 4);
    &.up{
      transform: translateY(15vh) scale(1);
    }
    &.down{
      transform: translateY(-15vh) scale(1);
    }
    &.right{
      transform: translateX(15vw) scale(1);
    }
    &.left{
      transform: translateX(-15vw) scale(1);
    }
    &.on{
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
}

@media screen and (max-width: \${this.get('breakpointMobile')}){
  #page{
    .hide-mobile{
      display:none !important;
    }
  }
}
//!#Layout
html,body{
  margin:0;
  padding:0;
}
*, *:before, *:after {
  box-sizing: border-box;
}

@font-face {
  font-family: "\${this.get('defaultFontFamily')}";
  src: url("/fonts/\${this.get('defaultFontFamily')}-Light.ttf") format("truetype");
}

@font-face {
  font-family: "\${this.get('defaultFontFamily')}";
  src: url("/fonts/\${this.get('defaultFontFamily')}-Bold.ttf") format("truetype");
  font-weight: 500;
}

body{
  &.is-scroll{
    #page {
      --header-height: min(calc(6rem + 3vh), 6rem);
      #header{
        background: rgb(255,255,255);
        box-shadow: 0 2px 10px -2px rgb(0 0 0 / 45%);
        opacity: 0;
        &:hover{
          opacity: 1;
        }
      }
    }
  }
}

#page{
  --header-height: min(calc(6rem + 3vh), 10rem);
  
  #header{
    display: flex;
    align-items: center;
    position: \${scope.inEditor?'relative':'fixed'};
    z-index: 2;
    top:0;
    width:100%;
    height: var(--header-height);    
    transition: height var(--default-transition-duration) ease-in, opacity var(--default-transition-duration) ease-in;

    #headerLogo{     
      > img{
        height: calc(var(--header-height) * 0.55);
        transition: height var(--default-transition-duration) ease-in;
      }
    }
  }
  #main{
    margin-top: \${scope.inEditor?'0':'var(--header-height)'};
    min-height: 50vh;
    img{
      border-radius: 0.4rem;
    }
  }
  #footer{
    #footerLogo > img{
      width:max(16vw, 18rem);
    }
  }  

  .indented,
  .indented-small,
  .indented-large{
    overflow: visible;
    display:block;
    max-width:calc(100% - 2rem);
    width: 100%;
    padding: 0 1rem;
    margin:0 auto;
  }
}


@media screen and (min-width: \${this.get('breakpointTablet')}){
  /* large desktop */
  #page{
    .indented-small{
      width:var(--breakpoint-mobile);
    }
    .indented{
      width:calc(var(--breakpoint-tablet) * 1.3);
    }    
    .indented-large{
      width:calc(var(--breakpoint-desktop) * 1.2);
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
    direction: ltr; /* reverse item order */
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
      direction: rtl; /* reverse item order */
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
[data-element-key="screenshot"]{
  &:has(img[data-loading="true"]){
    position: relative;
    &:before {
      content:'';
      display: block;
      width: 48px;
      height: 48px;
      position: absolute;
      top:50%;
      left:50%;
      transform: translate(-50%,-50%);
      border: 5px solid #FFF;
      border-bottom-color: #FF3D00;
      border-radius: 50%;
      display: inline-block;
      box-sizing: border-box;
      animation: screenshotLoader 1s linear infinite;
    }
  }
  @keyframes screenshotLoader {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
  } 
}
//!!#REMOVE>
[data-is-invisible="true"]:not([_inlineeditor=true]){
  display:none !important;
}
[data-element-key="background"]{
  display: flow-root; /* prevent margin collapse */
}
[data-element-key="screenshot"]{
  display: inline-block;
}

//!#Custom
#page{
  
  .button{
    cursor:pointer;
    text-align:center;
    display:inline-block;
    text-decoration: none;
    background-color: var(--color-main);
    box-shadow: inset 0 0 0 0.0625rem var(--color-main);
    color: #fff;
    font-size: var(--default-font-size);
    font-weight: 600;
    padding: 1rem 2.5rem;
    transition: color var(--default-transition-duration) linear;
    transition-property: color, background-color, box-shadow;
    &:hover {
      color:#fff;
      background-color: var(--color-main-dark);
      box-shadow: inset 0 0 0 0.0625rem var(--color-main-dark);
    }
    &:before{
      display: none;
    }
    &.small{
      min-width: 7.5rem;
      padding: .8125rem;
    }
    &.secondary{
      background-color: transparent;
      box-shadow: inset 0 0 0 0.0625rem rgba(36,28,21,.4);
      color: #241c15;
      &:hover{
        box-shadow: inset 0 0 0 0.0625rem #241c15;
        color: #241c15;
      }
    }
    &.plain{
      background: none;
      border: none;
      box-shadow:none;
      color: var(--color-main);
      font-weight: 500;
      padding-left: 0;
      padding-right: 0;
      &:hover{
        color: var(--color-main-dark);
        text-decoration: underline;
      }
    }
  }
}`