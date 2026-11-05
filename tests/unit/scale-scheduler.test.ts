import {afterEach,describe,expect,it,vi} from 'vitest';
import {runScaleStage} from '../../scripts/scale-scheduler.js';
afterEach(()=>vi.useRealTimers());
describe('bounded scale scheduler',()=>{
  it('enforces a shared 500ms launch gate and stage concurrency',async()=>{
    vi.useFakeTimers();const starts:number[]=[];let active=0,peak=0;const gate={lastStart:-Infinity};
    const promise=runScaleStage({count:10,concurrency:3,spacingMs:500},async index=>{starts.push(performance.now());peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,1200));active--;return index;},()=>undefined,gate);
    await vi.runAllTimersAsync();const result=await promise;
    expect(result.launched).toBe(10);expect(peak).toBe(3);for(let i=1;i<starts.length;i++)expect(starts[i]!-starts[i-1]!).toBeGreaterThanOrEqual(500);
  });
  it('stops further launches immediately on a challenge and drains in-flight work',async()=>{
    vi.useFakeTimers();const completed:number[]=[];
    const promise=runScaleStage({count:100,concurrency:4,spacingMs:500},async index=>{await new Promise(resolve=>setTimeout(resolve,index===0?1100:2000));completed.push(index);return index;},value=>value===0?'blocked':undefined,{lastStart:-Infinity});
    await vi.runAllTimersAsync();const result=await promise;
    expect(result.launched).toBe(3);expect(completed.sort()).toEqual([0,1,2]);expect(result.stopReason).toBe('blocked');
  });
  it('stops a serial stage after its third error without launching later jobs',async()=>{
    vi.useFakeTimers();
    const promise=runScaleStage({count:10,concurrency:1,spacingMs:500},async()=>{await new Promise(resolve=>setTimeout(resolve,10));return {error:true};},(_value,completed)=>completed.filter(value=>value.error).length>=3?'three-stage-errors':undefined,{lastStart:-Infinity});
    await vi.runAllTimersAsync();const result=await promise;
    expect(result.launched).toBe(3);expect(result.values).toHaveLength(3);expect(result.stopReason).toBe('three-stage-errors');
  });
});
