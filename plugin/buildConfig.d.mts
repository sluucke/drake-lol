import type { BuildOptions, Plugin } from 'esbuild';

export interface DrakeBuildInput {
  buildId: string;
  dev?: boolean;
}

export type DrakeBuildOptions = BuildOptions & { define: Record<string, string> };

export declare const SOURCE_EXTENSIONS: string[];
export declare function svgTextPlugin(): Plugin;
export declare function cssTextPlugin(): Plugin;
export declare function esbuildOptions(input: DrakeBuildInput): DrakeBuildOptions;
export declare function overlayOptions(input: DrakeBuildInput): DrakeBuildOptions;
