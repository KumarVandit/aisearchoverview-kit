import { defineConfig } from 'tsup';
export default defineConfig({entry:['src/index.ts','src/advanced.ts','src/cli.ts'],format:['esm','cjs'],dts:true,shims:true,clean:true,sourcemap:true,splitting:false,target:'node18'});
