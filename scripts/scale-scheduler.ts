export interface StagePolicy { count:number; concurrency:number; spacingMs:number }
export interface StageOutcome<T> { values:T[]; stopReason?:string; launched:number }

/** Sequential launch gate; already-started work drains after a stop signal. */
export async function runScaleStage<T>(policy:StagePolicy, job:(index:number)=>Promise<T>, stop:(value:T,completed:readonly T[])=>string|undefined, gate:{lastStart:number}):Promise<StageOutcome<T>> {
  const values:T[]=[],active=new Set<Promise<void>>();let launched=0,stopReason:string|undefined;
  while(launched<policy.count&&!stopReason){
    if(active.size>=policy.concurrency){await Promise.race(active);continue;}
    while(!stopReason && performance.now()<gate.lastStart+policy.spacingMs){
      await new Promise(resolve=>setTimeout(resolve,Math.ceil(gate.lastStart+policy.spacingMs-performance.now())));
    }
    if(stopReason)break;
    const index=launched++;gate.lastStart=performance.now();
    let task:Promise<void>;
    task=job(index).then(value=>{values.push(value);stopReason??=stop(value,values);}).finally(()=>active.delete(task));
    active.add(task);
  }
  await Promise.all(active);
  return {values,launched,...(stopReason?{stopReason}:{})};
}
