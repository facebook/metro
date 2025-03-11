"use strict";(self.webpackChunkmetro_website=self.webpackChunkmetro_website||[]).push([[9048],{65932:(e,t,a)=>{a.d(t,{A:()=>s});a(96540);var n=a(34164),i=a(50539),o=a(9303),r=a(74848);function s(e){var t=e.className;return(0,r.jsx)("main",{className:(0,n.A)("container margin-vert--xl",t),children:(0,r.jsx)("div",{className:"row",children:(0,r.jsxs)("div",{className:"col col--6 col--offset-3",children:[(0,r.jsx)(o.A,{as:"h1",className:"hero__title",children:(0,r.jsx)(i.default,{id:"theme.NotFound.title",description:"The title of the 404 page",children:"Page Not Found"})}),(0,r.jsx)("p",{children:(0,r.jsx)(i.default,{id:"theme.NotFound.p1",description:"The first paragraph of the 404 page",children:"We could not find what you were looking for."})}),(0,r.jsx)("p",{children:(0,r.jsx)(i.default,{id:"theme.NotFound.p2",description:"The 2nd paragraph of the 404 page",children:"Please contact the owner of the site that linked you to the original URL and let them know their link is broken."})})]})})})}},90483:(e,t,a)=>{a.r(t),a.d(t,{default:()=>fe});var n=a(96540),i=a(34164),o=a(59144),r=a(204),s=a(93751),l=a(22306),c=a(50539),d=a(65627),u=a(77685);const m={backToTopButton:"backToTopButton_sjWU",backToTopButtonShow:"backToTopButtonShow_xfvO"};var b=a(74848);function h(){var e=function(e){var t=e.threshold,a=(0,n.useState)(!1),i=a[0],o=a[1],r=(0,n.useRef)(!1),s=(0,d.gk)(),l=s.startScroll,c=s.cancelScroll;return(0,d.Mq)((function(e,a){var n=e.scrollY,i=null==a?void 0:a.scrollY;i&&(r.current?r.current=!1:n>=i?(c(),o(!1)):n<t?o(!1):n+window.innerHeight<document.documentElement.scrollHeight&&o(!0))})),(0,u.$)((function(e){e.location.hash&&(r.current=!0,o(!1))})),{shown:i,scrollToTop:function(){return l(0)}}}({threshold:300}),t=e.shown,a=e.scrollToTop;return(0,b.jsx)("button",{"aria-label":(0,c.translate)({id:"theme.BackToTopButton.buttonAriaLabel",message:"Scroll back to top",description:"The ARIA label for the back to top button"}),className:(0,i.A)("clean-btn",r.G.common.backToTopButton,m.backToTopButton,t&&m.backToTopButtonShow),type:"button",onClick:a})}var p=a(84924),x=a(56347),v=a(86682),f=a(53115),j=a(12862);function g(e){return(0,b.jsx)("svg",Object.assign({width:"20",height:"20","aria-hidden":"true"},e,{children:(0,b.jsxs)("g",{fill:"#7a7a7a",children:[(0,b.jsx)("path",{d:"M9.992 10.023c0 .2-.062.399-.172.547l-4.996 7.492a.982.982 0 01-.828.454H1c-.55 0-1-.453-1-1 0-.2.059-.403.168-.551l4.629-6.942L.168 3.078A.939.939 0 010 2.528c0-.548.45-.997 1-.997h2.996c.352 0 .649.18.828.45L9.82 9.472c.11.148.172.347.172.55zm0 0"}),(0,b.jsx)("path",{d:"M19.98 10.023c0 .2-.058.399-.168.547l-4.996 7.492a.987.987 0 01-.828.454h-3c-.547 0-.996-.453-.996-1 0-.2.059-.403.168-.551l4.625-6.942-4.625-6.945a.939.939 0 01-.168-.55 1 1 0 01.996-.997h3c.348 0 .649.18.828.45l4.996 7.492c.11.148.168.347.168.55zm0 0"})]})}))}const _="collapseSidebarButton_PEFL",k="collapseSidebarButtonIcon_kv0_";function A(e){var t=e.onClick;return(0,b.jsx)("button",{type:"button",title:(0,c.translate)({id:"theme.docs.sidebar.collapseButtonTitle",message:"Collapse sidebar",description:"The title attribute for collapse button of doc sidebar"}),"aria-label":(0,c.translate)({id:"theme.docs.sidebar.collapseButtonAriaLabel",message:"Collapse sidebar",description:"The title attribute for collapse button of doc sidebar"}),className:(0,i.A)("button button--secondary button--outline",_),onClick:t,children:(0,b.jsx)(g,{className:k})})}var C=a(23380),S=a(98587),N=a(7699),T=a(102),I=a(33535),B=a(30214),y=a(56289),w=a(9136),L=["item","onItemClick","activePath","level","index"];function M(e){var t=e.collapsed,a=e.categoryLabel,n=e.onClick;return(0,b.jsx)("button",{"aria-label":t?(0,c.translate)({id:"theme.DocSidebarItem.expandCategoryAriaLabel",message:"Expand sidebar category '{label}'",description:"The ARIA label to expand the sidebar category"},{label:a}):(0,c.translate)({id:"theme.DocSidebarItem.collapseCategoryAriaLabel",message:"Collapse sidebar category '{label}'",description:"The ARIA label to collapse the sidebar category"},{label:a}),"aria-expanded":!t,type:"button",className:"clean-btn menu__caret",onClick:n})}function E(e){var t=e.item,a=e.onItemClick,o=e.activePath,l=e.level,c=e.index,d=(0,S.A)(e,L),u=t.items,m=t.label,h=t.collapsible,p=t.className,x=t.href,v=(0,f.p)().docs.sidebar.autoCollapseCategories,j=function(e){var t=(0,w.default)();return(0,n.useMemo)((function(){return e.href&&!e.linkUnlisted?e.href:!t&&e.collapsible?(0,s.Nr)(e):void 0}),[e,t])}(t),g=(0,s.w8)(t,o),_=(0,B.ys)(x,o),k=(0,I.u)({initialState:function(){return!!h&&(!g&&t.collapsed)}}),A=k.collapsed,C=k.setCollapsed,E=(0,N.G)(),H=E.expandedItem,G=E.setExpandedItem,P=function(e){void 0===e&&(e=!A),G(e?null:c),C(e)};return function(e){var t=e.isActive,a=e.collapsed,i=e.updateCollapsed,o=(0,T.ZC)(t);(0,n.useEffect)((function(){t&&!o&&a&&i(!1)}),[t,o,a,i])}({isActive:g,collapsed:A,updateCollapsed:P}),(0,n.useEffect)((function(){h&&null!=H&&H!==c&&v&&C(!0)}),[h,H,c,C,v]),(0,b.jsxs)("li",{className:(0,i.A)(r.G.docs.docSidebarItemCategory,r.G.docs.docSidebarItemCategoryLevel(l),"menu__list-item",{"menu__list-item--collapsed":A},p),children:[(0,b.jsxs)("div",{className:(0,i.A)("menu__list-item-collapsible",{"menu__list-item-collapsible--active":_}),children:[(0,b.jsx)(y.default,Object.assign({className:(0,i.A)("menu__link",{"menu__link--sublist":h,"menu__link--sublist-caret":!x&&h,"menu__link--active":g}),onClick:h?function(e){null==a||a(t),x?P(!1):(e.preventDefault(),P())}:function(){null==a||a(t)},"aria-current":_?"page":void 0,role:h&&!x?"button":void 0,"aria-expanded":h&&!x?!A:void 0,href:h?null!=j?j:"#":j},d,{children:m})),x&&h&&(0,b.jsx)(M,{collapsed:A,categoryLabel:m,onClick:function(e){e.preventDefault(),P()}})]}),(0,b.jsx)(I.N,{lazy:!0,as:"ul",className:"menu__list",collapsed:A,children:(0,b.jsx)(K,{items:u,tabIndex:A?-1:0,onItemClick:a,activePath:o,level:l+1})})]})}var H=a(22887),G=a(15891);const P="menuExternalLink_NmtK";var R=["item","onItemClick","activePath","level","index"];function W(e){var t=e.item,a=e.onItemClick,n=e.activePath,o=e.level,l=(e.index,(0,S.A)(e,R)),c=t.href,d=t.label,u=t.className,m=t.autoAddBaseUrl,h=(0,s.w8)(t,n),p=(0,H.A)(c);return(0,b.jsx)("li",{className:(0,i.A)(r.G.docs.docSidebarItemLink,r.G.docs.docSidebarItemLinkLevel(o),"menu__list-item",u),children:(0,b.jsxs)(y.default,Object.assign({className:(0,i.A)("menu__link",!p&&P,{"menu__link--active":h}),autoAddBaseUrl:m,"aria-current":h?"page":void 0,to:c},p&&{onClick:a?function(){return a(t)}:void 0},l,{children:[d,!p&&(0,b.jsx)(G.A,{})]}))},d)}const O="menuHtmlItem_M9Kj";function D(e){var t=e.item,a=e.level,n=e.index,o=t.value,s=t.defaultStyle,l=t.className;return(0,b.jsx)("li",{className:(0,i.A)(r.G.docs.docSidebarItemLink,r.G.docs.docSidebarItemLinkLevel(a),s&&[O,"menu__list-item"],l),dangerouslySetInnerHTML:{__html:o}},n)}var F=["item"];function U(e){var t=e.item,a=(0,S.A)(e,F);switch(t.type){case"category":return(0,b.jsx)(E,Object.assign({item:t},a));case"html":return(0,b.jsx)(D,Object.assign({item:t},a));default:return(0,b.jsx)(W,Object.assign({item:t},a))}}var V=["items"];function Y(e){var t=e.items,a=(0,S.A)(e,V),n=(0,s.Y)(t,a.activePath);return(0,b.jsx)(N.A,{children:n.map((function(e,t){return(0,b.jsx)(U,Object.assign({item:e,index:t},a),t)}))})}const K=(0,n.memo)(Y),z="menu_SIkG",q="menuWithAnnouncementBar_GW3s";function J(e){var t=e.path,a=e.sidebar,o=e.className,s=function(){var e=(0,C.M)().isActive,t=(0,n.useState)(e),a=t[0],i=t[1];return(0,d.Mq)((function(t){var a=t.scrollY;e&&i(0===a)}),[e]),e&&a}();return(0,b.jsx)("nav",{"aria-label":(0,c.translate)({id:"theme.docs.sidebar.navAriaLabel",message:"Docs sidebar",description:"The ARIA label for the sidebar navigation"}),className:(0,i.A)("menu thin-scrollbar",z,s&&q,o),children:(0,b.jsx)("ul",{className:(0,i.A)(r.G.docs.docSidebarMenu,"menu__list"),children:(0,b.jsx)(K,{items:a,activePath:t,level:1})})})}const Q="sidebar_njMd",X="sidebarWithHideableNavbar_wUlq",Z="sidebarHidden_VK0M",$="sidebarLogo_isFc";function ee(e){var t=e.path,a=e.sidebar,n=e.onCollapse,o=e.isHidden,r=(0,f.p)(),s=r.navbar.hideOnScroll,l=r.docs.sidebar.hideable;return(0,b.jsxs)("div",{className:(0,i.A)(Q,s&&X,o&&Z),children:[s&&(0,b.jsx)(j.A,{tabIndex:-1,className:$}),(0,b.jsx)(J,{path:t,sidebar:a}),l&&(0,b.jsx)(A,{onClick:n})]})}const te=n.memo(ee);var ae=a(63065),ne=a(5528),ie=function(e){var t=e.sidebar,a=e.path,n=(0,ne.M)();return(0,b.jsx)("ul",{className:(0,i.A)(r.G.docs.docSidebarMenu,"menu__list"),children:(0,b.jsx)(K,{items:t,activePath:a,onItemClick:function(e){"category"===e.type&&e.href&&n.toggle(),"link"===e.type&&n.toggle()},level:1})})};function oe(e){return(0,b.jsx)(ae.GX,{component:ie,props:e})}const re=n.memo(oe);function se(e){var t=(0,v.l)(),a="desktop"===t||"ssr"===t,n="mobile"===t;return(0,b.jsxs)(b.Fragment,{children:[a&&(0,b.jsx)(te,Object.assign({},e)),n&&(0,b.jsx)(re,Object.assign({},e))]})}const le={expandButton:"expandButton_TmdG",expandButtonIcon:"expandButtonIcon_i1dp"};function ce(e){var t=e.toggleSidebar;return(0,b.jsx)("div",{className:le.expandButton,title:(0,c.translate)({id:"theme.docs.sidebar.expandButtonTitle",message:"Expand sidebar",description:"The ARIA label and title attribute for expand button of doc sidebar"}),"aria-label":(0,c.translate)({id:"theme.docs.sidebar.expandButtonAriaLabel",message:"Expand sidebar",description:"The ARIA label and title attribute for expand button of doc sidebar"}),tabIndex:0,role:"button",onKeyDown:t,onClick:t,children:(0,b.jsx)(g,{className:le.expandButtonIcon})})}const de={docSidebarContainer:"docSidebarContainer_YfHR",docSidebarContainerHidden:"docSidebarContainerHidden_DPk8",sidebarViewport:"sidebarViewport_aRkj"};function ue(e){var t,a=e.children,i=(0,l.t)();return(0,b.jsx)(n.Fragment,{children:a},null!=(t=null==i?void 0:i.name)?t:"noSidebar")}function me(e){var t=e.sidebar,a=e.hiddenSidebarContainer,o=e.setHiddenSidebarContainer,s=(0,x.zy)().pathname,l=(0,n.useState)(!1),c=l[0],d=l[1],u=(0,n.useCallback)((function(){c&&d(!1),!c&&(0,p.O)()&&d(!0),o((function(e){return!e}))}),[o,c]);return(0,b.jsx)("aside",{className:(0,i.A)(r.G.docs.docSidebarContainer,de.docSidebarContainer,a&&de.docSidebarContainerHidden),onTransitionEnd:function(e){e.currentTarget.classList.contains(de.docSidebarContainer)&&a&&d(!0)},children:(0,b.jsx)(ue,{children:(0,b.jsxs)("div",{className:(0,i.A)(de.sidebarViewport,c&&de.sidebarViewportHidden),children:[(0,b.jsx)(se,{sidebar:t,path:s,onCollapse:u,isHidden:c}),c&&(0,b.jsx)(ce,{toggleSidebar:u})]})})})}const be={docMainContainer:"docMainContainer_TBSr",docMainContainerEnhanced:"docMainContainerEnhanced_lQrH",docItemWrapperEnhanced:"docItemWrapperEnhanced_JWYK"};function he(e){var t=e.hiddenSidebarContainer,a=e.children,n=(0,l.t)();return(0,b.jsx)("main",{className:(0,i.A)(be.docMainContainer,(t||!n)&&be.docMainContainerEnhanced),children:(0,b.jsx)("div",{className:(0,i.A)("container padding-top--md padding-bottom--lg",be.docItemWrapper,t&&be.docItemWrapperEnhanced),children:a})})}const pe={docRoot:"docRoot_UBD9",docsWrapper:"docsWrapper_hBAB"};function xe(e){var t=e.children,a=(0,l.t)(),i=(0,n.useState)(!1),o=i[0],r=i[1];return(0,b.jsxs)("div",{className:pe.docsWrapper,children:[(0,b.jsx)(h,{}),(0,b.jsxs)("div",{className:pe.docRoot,children:[a&&(0,b.jsx)(me,{sidebar:a.items,hiddenSidebarContainer:o,setHiddenSidebarContainer:r}),(0,b.jsx)(he,{hiddenSidebarContainer:o,children:t})]})]})}var ve=a(65932);function fe(e){var t=(0,s.B5)(e);if(!t)return(0,b.jsx)(ve.A,{});var a=t.docElement,n=t.sidebarName,c=t.sidebarItems;return(0,b.jsx)(o.e3,{className:(0,i.A)(r.G.page.docsDocPage),children:(0,b.jsx)(l.V,{name:n,items:c,children:(0,b.jsx)(xe,{children:a})})})}}}]);