/** World-map mark label geometry; ty is the nominal lower edge of the label. */
export function mapMarkLabelBox(x:number,ty:number,textWidth:number,fontSize:number) {
  return {x:x-textWidth/2-2,y:ty-fontSize,width:textWidth+4,height:fontSize+3};
}
/** Center text against the exact rectangle, independent of inherited canvas baseline. */
export function drawMapMarkLabel(g:CanvasRenderingContext2D,text:string,x:number,ty:number,textWidth:number,fontSize:number,color:string) {
  const box=mapMarkLabelBox(x,ty,textWidth,fontSize);
  g.save();
  g.fillStyle='rgba(246,239,222,0.82)';g.fillRect(box.x,box.y,box.width,box.height);
  g.textAlign='center';g.textBaseline='middle';g.fillStyle=color;g.fillText(text,x,box.y+box.height/2);
  g.restore();
}
