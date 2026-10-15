#!/usr/bin/env node
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
function val(key, fallback) { const i=args.indexOf(key); return i<0?fallback:args[i+1] }
const script=val('--script',''), out=val('--out','C:/Users/HOANGDV/Videos/H-MMO/GoiSach'), only=val('--only','both'), limit=Number(val('--limit','0'))||undefined, shortsStyle=val('--shorts-style','whiteboard'), wbImageDir=val('--wb-image-dir',undefined), imageSource=val('--image-source','auto'), apiKey=val('--gemini-key',process.env.GEMINI_API_KEY), imageModel=val('--image-model',undefined)
if(!script || !fs.existsSync(script)){console.error('Dùng: node scripts/goisach-render.mjs --script <md> --out <dir> [--only shorts|long] [--limit N]');process.exit(2)}
require.extensions['.ts']=(module,filename)=>{const ts=require('typescript'),source=fs.readFileSync(filename,'utf8');module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename)}
const {renderGoiSach}=require(path.join(root,'src','main','goiSachEngine.ts'))
const dir=await renderGoiSach({script,outDir:out,only,limit,voice:val('--voice','vieneu:default'),music:val('--music',undefined),shortsStyle,wbImageDir,imageSource,apiKey,imageModel},(p,m)=>console.log(`[${p}%] ${m}`))
console.log(`Kết quả: ${dir}`)
