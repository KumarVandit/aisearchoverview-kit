/** Encodes a canonical location as Google's UULE location hint; it does not change network egress. */
export function locationHint(location:string):string {
  if(typeof location!=='string'||!location.trim())throw new TypeError('location must be a nonempty canonical location');
  const parts=location.split(',').map(value=>value.trim());
  if(parts.length!==3||parts.some(value=>!value))throw new TypeError('location must use City,Region,Country format');
  const canonical=parts.join(',');
  const bytes=new TextEncoder().encode(canonical);
  if(bytes.length>63)throw new RangeError('location must be at most 63 UTF-8 bytes');
  return 'w+'+btoa(String.fromCharCode(8,2,16,32,34,bytes.length,...bytes));
}
export function validateDevice(device:unknown):void {
  if(device!==undefined&&device!=='desktop')throw new TypeError('Only the desktop native profile is supported');
}
