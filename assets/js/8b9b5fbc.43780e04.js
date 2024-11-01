"use strict";(self.webpackChunkmetro_website=self.webpackChunkmetro_website||[]).push([[424],{18704:(e,t,n)=>{n.r(t),n.d(t,{assets:()=>d,contentTitle:()=>m,default:()=>u,frontMatter:()=>l,metadata:()=>p,toc:()=>s});var a=n(87462),o=n(63366),r=(n(67294),n(3905)),i=["components"],l={id:"local-development",title:"Local Development Setup"},m=void 0,p={unversionedId:"local-development",id:"local-development",title:"Local Development Setup",description:"This page includes tips for developers working on Metro itself, including how to test your changes within other local projects.",source:"@site/../docs/LocalDevelopment.md",sourceDirName:".",slug:"/local-development",permalink:"/docs/local-development",draft:!1,editUrl:"https://github.com/facebook/metro/edit/main/docs/../docs/LocalDevelopment.md",tags:[],version:"current",lastUpdatedAt:1730485694,formattedLastUpdatedAt:"Nov 1, 2024",frontMatter:{id:"local-development",title:"Local Development Setup"},sidebar:"docs",previous:{title:"Troubleshooting",permalink:"/docs/troubleshooting"},next:{title:"Bundle Formats",permalink:"/docs/bundling"}},d={},s=[{value:"Testing Metro Changes inside a React Native Project",id:"testing-metro-changes-inside-a-react-native-project",level:3},{value:"Debug Logging",id:"debug-logging",level:3}],c={toc:s},g="wrapper";function u(e){var t=e.components,n=(0,o.Z)(e,i);return(0,r.mdx)(g,(0,a.Z)({},c,n,{components:t,mdxType:"MDXLayout"}),(0,r.mdx)("p",null,"This page includes tips for developers working on Metro itself, including how to test your changes within other local projects."),(0,r.mdx)("h3",{id:"testing-metro-changes-inside-a-react-native-project"},"Testing Metro Changes inside a React Native Project"),(0,r.mdx)("p",null,"When developing Metro, running your iterations against a local target project can be a great way to test the impact of your changes end-to-end."),(0,r.mdx)("p",null,"Our recommended workflow is to use ",(0,r.mdx)("a",{parentName:"p",href:"https://classic.yarnpkg.com/en/docs/cli/link"},(0,r.mdx)("inlineCode",{parentName:"a"},"yarn link"))," to register local ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," packages within your development clone and then hot-switch to these versions in the consuming project. These instructions cover linking a local Metro clone with a bare workflow React Native app (i.e. having run ",(0,r.mdx)("inlineCode",{parentName:"p"},"npx react-native init MetroTestApp"),")."),(0,r.mdx)("pre",null,(0,r.mdx)("code",{parentName:"pre",className:"language-sh"},".\n\u2514\u2500\u2500 Development\n    \u251c\u2500\u2500 metro        # metro clone\n    \u2514\u2500\u2500 MetroTestApp # target project\n")),(0,r.mdx)("ol",null,(0,r.mdx)("li",{parentName:"ol"},(0,r.mdx)("p",{parentName:"li"},(0,r.mdx)("strong",{parentName:"p"},"Use ",(0,r.mdx)("inlineCode",{parentName:"strong"},"yarn link")," in your ",(0,r.mdx)("inlineCode",{parentName:"strong"},"metro")," clone to register local packages")),(0,r.mdx)("p",{parentName:"li"},"From inside our ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," clone, ",(0,r.mdx)("inlineCode",{parentName:"p"},"yarn link")," is responsible for registering local package folders to be linked to elsewhere."),(0,r.mdx)("p",{parentName:"li"},"We recommend using ",(0,r.mdx)("inlineCode",{parentName:"p"},"npm exec --workspaces")," to register all packages in the ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," repo \u2014 these can be individually linked into the target project later."),(0,r.mdx)("pre",{parentName:"li"},(0,r.mdx)("code",{parentName:"pre"},"npm exec --workspaces -- yarn link\n"))),(0,r.mdx)("li",{parentName:"ol"},(0,r.mdx)("p",{parentName:"li"},(0,r.mdx)("strong",{parentName:"p"},"Use ",(0,r.mdx)("inlineCode",{parentName:"strong"},"yarn link")," to replace Metro packages in your target project")),(0,r.mdx)("p",{parentName:"li"},"From inside our target project folder, ",(0,r.mdx)("inlineCode",{parentName:"p"},"yarn link <package-name>")," can be used to apply our registered ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," packages for that project only."),(0,r.mdx)("pre",{parentName:"li"},(0,r.mdx)("code",{parentName:"pre",className:"language-sh"},"# Links 3 packages\nyarn link metro metro-config metro-runtime\n")),(0,r.mdx)("p",{parentName:"li"},"Note: At mininum, the ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," and ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro-runtime")," packages need to be linked.")),(0,r.mdx)("li",{parentName:"ol"},(0,r.mdx)("p",{parentName:"li"},(0,r.mdx)("strong",{parentName:"p"},"Configure Metro ",(0,r.mdx)("inlineCode",{parentName:"strong"},"watchFolders")," to work with our linked packages")),(0,r.mdx)("p",{parentName:"li"},"Because ",(0,r.mdx)("inlineCode",{parentName:"p"},"yarn link")," has included files outside of the immediate React Native project folder, we need to inform Metro that this set of files exists (as it will not automatically follow the symlinks). Add the following to your ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro.config.js"),":"),(0,r.mdx)("pre",{parentName:"li"},(0,r.mdx)("code",{parentName:"pre",className:"language-diff"},"+ const path = require('path');\n\n  module.exports = {\n+   watchFolders: [\n+     path.resolve(__dirname, './node_modules'),\n+     // Include necessary file paths for `yarn link`ed modules\n+     path.resolve(__dirname, '../metro/packages'),\n+     path.resolve(__dirname, '../metro/node_modules'),\n+   ],\n    ...\n  };\n")),(0,r.mdx)("p",{parentName:"li"},(0,r.mdx)("strong",{parentName:"p"},"Run Metro")),(0,r.mdx)("p",{parentName:"li"},"Now we should be able to run Metro within our target project. Remember to restart this command after any code changes you make to ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," or to the target project's ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro.config.js")," file."),(0,r.mdx)("pre",{parentName:"li"},(0,r.mdx)("code",{parentName:"pre"},"yarn react-native start\n"))),(0,r.mdx)("li",{parentName:"ol"},(0,r.mdx)("p",{parentName:"li"},(0,r.mdx)("strong",{parentName:"p"},"(Optional) Clean up with ",(0,r.mdx)("inlineCode",{parentName:"strong"},"yarn unlink"))),(0,r.mdx)("p",{parentName:"li"},"If you want to restore the remote (i.e. production npm) versions of ",(0,r.mdx)("inlineCode",{parentName:"p"},"metro")," packages in your target project, step 2 (and 1) can be repeated with ",(0,r.mdx)("inlineCode",{parentName:"p"},"yarn unlink"),"."))),(0,r.mdx)("h3",{id:"debug-logging"},"Debug Logging"),(0,r.mdx)("p",null,"Metro uses the ",(0,r.mdx)("a",{parentName:"p",href:"https://www.npmjs.com/package/debug"},"debug")," package to write logs under named debug scopes (for example: ",(0,r.mdx)("inlineCode",{parentName:"p"},"Metro:WatchmanWatcher"),"). Set the ",(0,r.mdx)("inlineCode",{parentName:"p"},"DEBUG")," environment variable before starting Metro to enable logs matching the supplied pattern."),(0,r.mdx)("p",null,"The snippet below provides a pattern matching all Metro-defined messages."),(0,r.mdx)("pre",null,(0,r.mdx)("code",{parentName:"pre"},"DEBUG='Metro:*' yarn metro serve\n")))}u.isMDXComponent=!0}}]);