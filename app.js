const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    document.getElementById('fileInput').files = e.dataTransfer.files;
    document.getElementById('fileInput').dispatchEvent(new Event('change'));
  }
});

var INST_MAP = {};
var INST_LIST = [];
var CLASS_MAP = {};
var SELECTED_INSTS = [];
var IS_MULTI_SELECT_MODE = false;
var CURRENT_LUA_VARIANT = 'server';
var SEARCH_QUERY = '';
var IGNORED_CLASSES = ['Keyframe', 'KeyframeSequence', 'Pose'];
var IGNORED_PROPS = [
  'Parent', 'Source', 'AttributesSerialize', 'ClassName', 'DataCost',
  'RobloxLocked', 'Guid', 'UniqueId', 'Tags', 'Capabilities',
  'DefinedCapabilities', 'Sandboxed', 'NetworkIsSpanning',
  'AssemblyLinearVelocity', 'AssemblyAngularVelocity', 'ReceiveAge',
  'Archivable', 'Prepared', 'WorldMatrix', 'Mass', 'CenterOfMass',
  'PlaybackLoudness', 'Origin'
];

var ENUM_PROP_MAP = {
  Shape: 'PartType',
  Material: 'Material',
  FormFactor: 'FormFactor',
  TextXAlignment: 'TextXAlignment',
  TextYAlignment: 'TextYAlignment',
  Font: 'Font',
  SizeConstraint: 'SizeConstraint',
  AutomaticSize: 'AutomaticSize',
  ScaleType: 'ScaleType',
  SortOrder: 'SortOrder',
  FillDirection: 'FillDirection',
  HorizontalAlignment: 'HorizontalAlignment',
  VerticalAlignment: 'VerticalAlignment',
  EasingDirection: 'EasingDirection',
  EasingStyle: 'EasingStyle',
  ZIndexBehavior: 'ZIndexBehavior',
  BorderMode: 'BorderMode',
  NormalId: 'NormalId',
  SurfaceType: 'SurfaceType',
  TopSurface: 'SurfaceType',
  BottomSurface: 'SurfaceType',
  LeftSurface: 'SurfaceType',
  RightSurface: 'SurfaceType',
  FrontSurface: 'SurfaceType',
  BackSurface: 'SurfaceType',
  CameraType: 'CameraType',
  Style: 'FrameStyle',
  ButtonStyle: 'ButtonStyle'
};

var ACTIVE_FILTERS = {
  service: false,
  '3dInstance': false,
  gui: false,
  script: true,
  localScript: true,
  moduleScript: true,
  avatar: false,
  valueObject: false,
  effect: false,
  sound: false,
  constraint: false,
  detection: false,
  data: false,
  folder: false,
  atmosphere: false,
  misc: false
};

function onSearchInput(val) {
  SEARCH_QUERY = val.toLowerCase().trim();
  buildTree();
}

function toggleMultiSelectMode() {
  IS_MULTI_SELECT_MODE = !IS_MULTI_SELECT_MODE;
  var btn = document.getElementById('multiSelectToggleBtn');
  var status = document.getElementById('multiSelectStatus');
  if (IS_MULTI_SELECT_MODE) {
    btn.classList.add('btn-active');
    status.textContent = 'ON';
  } else {
    btn.classList.remove('btn-active');
    status.textContent = 'OFF';
  }
}

function toggleFilterMenu(e) {
  e.stopPropagation();
  document.getElementById('filterMenu').classList.toggle('show');
}

window.addEventListener('click', function() {
  var menu = document.getElementById('filterMenu');
  if (menu) menu.classList.remove('show');
});

function updateFilters() {
  var checkboxes = document.querySelectorAll('#filterMenu input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    ACTIVE_FILTERS[cb.value] = cb.checked;
  });
  buildTree();
}

function selectAllFilters(val) {
  var checkboxes = document.querySelectorAll('#filterMenu input[type="checkbox"]');
  checkboxes.forEach(function(cb) {
    cb.checked = val;
    ACTIVE_FILTERS[cb.value] = val;
  });
  buildTree();
}

function setLuaVariant(variant) {
  CURRENT_LUA_VARIANT = variant;
  document.getElementById('varServerBtn').classList.toggle('active', variant === 'server');
  document.getElementById('varLocalBtn').classList.toggle('active', variant === 'local');
  document.getElementById('varModuleBtn').classList.toggle('active', variant === 'module');
  showProps();
}

document.getElementById('fileInput').addEventListener('change', function() {
  var f = this.files[0];
  if (!f) return;
  setStatus('Reading ' + f.name + ' (' + fmtSize(f.size) + ')...');
  var r = new FileReader();
  r.onload = function(e) {
    var bytes = new Uint8Array(e.target.result);
    try {
      if (isXML(bytes)) {
        setStatus('XML format. Parsing...');
        parseXML(new TextDecoder('utf-8',{fatal:false}).decode(bytes));
      } else if (bytes[0]===0x3c && bytes[1]===0x72 && bytes[7]===0x21) {
        setStatus('Binary format. Parsing...');
        parseBinary(bytes);
      } else {
        setStatus('ERROR: Not a recognised Roblox file.');
      }
    } catch(ex) {
      setStatus('ERROR: ' + ex.message);
    }
  };
  r.readAsArrayBuffer(f);
});

function isXML(b) {
  if (b[0]===0xEF && b[1]===0xBB && b[2]===0xBF) return b[3]===0x3c;
  return b[0]===0x3c && b[7]!==0x21;
}

function setStatus(s) { document.getElementById('status').textContent = s; }
function fmtSize(n) {
  if (n<1024) return n+' B';
  if (n<1048576) return (n/1024).toFixed(1)+' KB';
  return (n/1048576).toFixed(1)+' MB';
}

function lz4dec(src, dstSize) {
  try {
    var dst = new Uint8Array(dstSize);
    var s=0, d=0;
    while (s < src.length && d < dstSize) {
      var tok = src[s++];
      var ll = (tok>>4)&0xf;
      if (ll===15) { var x; do { x=src[s++]; ll+=x; } while(x===255 && s<src.length); }
      for (var i=0;i<ll && s<src.length && d<dstSize;i++) dst[d++]=src[s++];
      if (s>=src.length) break;
      if (s+1>=src.length) break;
      var off = src[s]|(src[s+1]<<8); s+=2;
      if (off===0 || off>d) break;
      var ml = (tok&0xf)+4;
      if (ml-4===15) { var x; do { x=src[s++]; ml+=x; } while(x===255 && s<src.length); }
      var cp = d-off;
      for (var i=0;i<ml && d<dstSize;i++) { dst[d]=dst[cp]; d++; cp++; }
    }
    return dst.subarray(0,d);
  } catch(ex) {
    return new Uint8Array(dstSize);
  }
}

function zstdDec(src, dstSize) {
  try {
    var p=0;
    if (p+4>src.length) throw new Error('Invalid zstd: too short');
    var mag = (src[p]|(src[p+1]<<8)|(src[p+2]<<16)|((src[p+3]&0xff)*0x1000000))>>>0;
    p+=4;
    if (mag !== 0xFD2FB528) throw new Error('Not zstd frame');
    if (p>=src.length) throw new Error('Invalid zstd: truncated header');
    var fhd=src[p++];
    var fcsFlag=(fhd>>6)&3, singleSeg=(fhd>>5)&1, didFlag=fhd&3;
    if (!singleSeg && p<src.length) p++;
    p += [0,1,2,4][didFlag];
    if (fcsFlag===0){ if(singleSeg && p<src.length) p++; }
    else if(fcsFlag===1) p+=2;
    else if(fcsFlag===2) p+=4;
    else p+=8;

    if (p>=src.length) throw new Error('Invalid zstd: no blocks');

    var dst = new Uint8Array(dstSize||4194304);
    var dPos=0;
    var maxIter=10000;
    while(maxIter-->0 && p+3<=src.length) {
      var bh0=src[p],bh1=src[p+1],bh2=src[p+2]; p+=3;
      var last=bh0&1, bType=(bh0>>1)&3;
      var bSize=(bh0>>3)|(bh1<<5)|(bh2<<13);
      if (p+bSize>src.length) break;
      if (bType===0) {
        for(var i=0;i<bSize && dPos<dst.length;i++) dst[dPos++]=src[p+i]; p+=bSize;
      } else if (bType===1) {
        if (p>=src.length) break;
        var b=src[p++]; for(var i=0;i<bSize && dPos<dst.length;i++) dst[dPos++]=b;
      } else if (bType===2) {
        var bEnd=p+bSize;
        var lits=zstdLits(src,p,bEnd); p=lits.np;
        var ld=lits.data;
        for(var i=0;i<ld.length && dPos<dst.length;i++) dst[dPos++]=ld[i];
        p=bEnd;
      } else break;
      if(last) break;
    }
    return dst.subarray(0,dPos);
  } catch(ex) {
    return new Uint8Array(dstSize||0);
  }
}

function zstdLits(src, p, bEnd) {
  try {
    if (p>=src.length) return {data:new Uint8Array(0), np:p};
    var litType=src[p]&3, lss=(src[p]>>2)&3;
    if (litType===0||litType===2) {
      var sz;
      if(lss===0||lss===2){sz=src[p]>>3;p++;}
      else if(lss===1 && p+1<src.length){sz=(src[p]>>4)|(src[p+1]<<4);p+=2;}
      else if(p+2<src.length){sz=(src[p]>>4)|(src[p+1]<<4)|(src[p+2]<<12);p+=3;}
      else return {data:new Uint8Array(0), np:p};
      if(litType===0){ 
        var end=Math.min(p+sz, src.length);
        return {data:src.subarray(p,end), np:end}; 
      }
      else{ 
        if(p>=src.length) return {data:new Uint8Array(0), np:p};
        var d=new Uint8Array(sz); d.fill(src[p]); return {data:d, np:p+1}; 
      }
    } else {
      var sz, cz;
      if(lss===0 && p+2<src.length){sz=(src[p]>>4)|((src[p+1]&0x3f)<<4);cz=(src[p+1]>>6)|(src[p+2]<<2);p+=3;}
      else if(lss===1 && p+2<src.length){sz=(src[p]>>4)|(src[p+1]<<4);cz=src[p+2];p+=3;}
      else if(p+3<src.length){sz=(src[p]>>4)|(src[p+1]<<4)|((src[p+2]&3)<<12);cz=(src[p+2]>>2)|(src[p+3]<<6);p+=4;}
      else return {data:new Uint8Array(0), np:p};
      var jump=(litType===3)?sz:cz;
      var end=Math.min(p+Math.min(sz,bEnd-p), src.length);
      return {data:src.subarray(p,end), np:Math.min(p+jump, src.length)};
    }
  } catch(ex) {
    return {data:new Uint8Array(0), np:p};
  }
}

function decompress(raw, decompLen) {
  try {
    if (!raw || !raw.length || raw.length===decompLen) return raw;
    if (raw.length<4) return raw;
    var mag=(raw[0]|(raw[1]<<8)|(raw[2]<<16)|((raw[3]&0xff)*0x1000000))>>>0;
    if (mag===0xFD2FB528) return zstdDec(raw, decompLen);
    return lz4dec(raw, decompLen);
  } catch(ex) {
    return raw;
  }
}

function ru32(b,p){ 
  if(p+3>=b.length) return 0;
  return (b[p]|(b[p+1]<<8)|(b[p+2]<<16)|((b[p+3]&0xff)*0x1000000))>>>0; 
}
function ri32(b,p){ var v=ru32(b,p); return v>0x7fffffff?v-0x100000000:v; }
function rf32(b,p){
  try {
    if(p+3>=b.length) return 0;
    var dv=new DataView(new ArrayBuffer(4));
    dv.setUint8(0,b[p]);dv.setUint8(1,b[p+1]);dv.setUint8(2,b[p+2]);dv.setUint8(3,b[p+3]);
    return dv.getFloat32(0,true);
  } catch(ex) { return 0; }
}
function rf32be(b,p){
  try {
    if(p+3>=b.length) return 0;
    var dv=new DataView(new ArrayBuffer(4));
    dv.setUint8(0,b[p]);dv.setUint8(1,b[p+1]);dv.setUint8(2,b[p+2]);dv.setUint8(3,b[p+3]);
    return dv.getFloat32(0,false);
  } catch(ex) { return 0; }
}
function rf64(b,p){
  try {
    if(p+7>=b.length) return 0;
    var dv=new DataView(new ArrayBuffer(8));
    for(var i=0;i<8;i++) dv.setUint8(i,b[p+i]);
    return dv.getFloat64(0,true);
  } catch(ex) { return 0; }
}
function rStr(b,p){
  try {
    if(p+4>b.length) return {val:'',end:p};
    var len=ru32(b,p);
    if(p+4+len>b.length) return {val:'',end:p+4};
    return {val:new TextDecoder('utf-8',{fatal:false}).decode(b.subarray(p+4,p+4+len)), end:p+4+len};
  } catch(ex) { return {val:'',end:p}; }
}

function rArr(b, count, fn) {
  var out=[];
  for(var i=0;i<count;i++){
    var v=fn(b,i);
    if(v===undefined||v===null) out.push(0);
    else out.push(v);
  }
  return out;
}

function decDelta32(b) {
  if(!b||!b.length) return [];
  var arr=[], acc=0;
  for(var i=0;i<b.length;i+=4){
    if(i+3>=b.length) break;
    var delta=ri32(b,i);
    acc+=delta;
    arr.push(acc);
  }
  return arr;
}
function decDeltaF(b) {
  if(!b||!b.length) return [];
  var arr=[], acc=0;
  for(var i=0;i<b.length;i+=4){
    if(i+3>=b.length) break;
    var delta=rf32(b,i);
    acc+=delta;
    arr.push(acc);
  }
  return arr;
}
function decInterF(b) {
  if(!b||!b.length) return [];
  var n=b.length/4|0, arr=[];
  for(var i=0;i<n;i++){
    if(i*4+3>=b.length) break;
    arr.push(rf32be(b, i*4));
  }
  return arr;
}

function parseBinary(bytes) {
  INST_MAP={}; INST_LIST=[]; CLASS_MAP={}; SELECTED_INSTS=[];

  if (bytes.length<32) throw new Error('File too short');
  var magic = new TextDecoder().decode(bytes.subarray(0,8));
  if (magic!=='<roblox!') throw new Error('Invalid binary magic');

  var p=32;
  var chunkCount=0, instCount=0, propsCount=0;
  var sharedStrings=[];

  while (p+16<=bytes.length && chunkCount<5000) {
    chunkCount++;
    var chunkName=new TextDecoder().decode(bytes.subarray(p,p+4));
    var compLen=ru32(bytes,p+4);
    var decompLen=ru32(bytes,p+8);
    p+=16;
    if (p+compLen>bytes.length) break;
    var rawData=bytes.subarray(p,p+compLen);
    p+=compLen;

    try {
      var data=decompress(rawData,decompLen);
      if(!data||!data.length) continue;

      if(chunkName==='INST'){
        var dp=0;
        if(dp+4>data.length) continue;
        var classId=ri32(data,dp); dp+=4;
        var clsName=rStr(data,dp); dp=clsName.end;
        var isService=(data[dp]===1); dp++;
        if(dp+4>data.length) continue;
        var objCnt=ri32(data,dp); dp+=4;
        if(objCnt<0||objCnt>1000000) continue;
        var refArr=decDelta32(data.subarray(dp,dp+objCnt*4));

        if (IGNORED_CLASSES.indexOf(clsName.val) !== -1) {
          continue;
        }

        instCount+=refArr.length;
        CLASS_MAP[classId]={name:clsName.val,refs:refArr,isService:isService};
        for(var i=0;i<refArr.length;i++){
          var inst={id:refArr[i],cls:clsName.val,name:clsName.val,props:{},children:[],parentId:-1,isService:isService};
          INST_MAP[refArr[i]]=inst;
          INST_LIST.push(inst);
        }
      }
      else if(chunkName==='PROP'){
        var dp=0;
        if(dp+4>data.length) continue;
        var classId=ri32(data,dp); dp+=4;
        var propName=rStr(data,dp); dp=propName.end;
        if(!CLASS_MAP[classId]) continue;
        var refs=CLASS_MAP[classId].refs;
        if(dp>=data.length) continue;
        var typeCode=data[dp]; dp++;

        try {
          if(typeCode===0x01){
            for(var i=0;i<refs.length && dp<data.length;i++){
              var s=rStr(data,dp); dp=s.end;
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'str',v:s.val};
            }
          }
          else if(typeCode===0x02){
            for(var i=0;i<refs.length && dp<data.length;i++){
              var val=(data[dp]===1); dp++;
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'bool',v:val};
            }
          }
          else if(typeCode===0x03){
            var ints=decDelta32(data.subarray(dp,dp+refs.length*4));
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'num',v:ints[i]||0};
            }
          }
          else if(typeCode===0x04){
            var floats=decDeltaF(data.subarray(dp,dp+refs.length*4));
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'num',v:floats[i]||0};
            }
          }
          else if(typeCode===0x05){
            var doubles=rArr(data,refs.length,function(b,i){
              if(i*8+7>=b.length) return 0;
              return rf64(b,i*8);
            });
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'num',v:doubles[i]||0};
            }
          }
          else if(typeCode===0x06){
            var xs=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var xo=decDelta32(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var ys=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var yo=decDelta32(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'udim2',v:{xs:xs[i]||0,xo:xo[i]||0,ys:ys[i]||0,yo:yo[i]||0}};
            }
          }
          else if(typeCode===0x07){
            var s=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var o=decDelta32(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'udim',v:{s:s[i]||0,o:o[i]||0}};
            }
          }
          else if(typeCode===0x08){
            var codes=decDelta32(data.subarray(dp,dp+refs.length*4));
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'bc',v:codes[i]||0};
            }
          }
          else if(typeCode===0x09){
            var r=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var g=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var b=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'col3',v:{r:r[i]||0,g:g[i]||0,b:b[i]||0}};
            }
          }
          else if(typeCode===0x0a){
            var x=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var y=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'v2',v:{x:x[i]||0,y:y[i]||0}};
            }
          }
          else if(typeCode===0x0b){
            var x=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var y=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            var z=decInterF(data.subarray(dp,dp+refs.length*4)); dp+=refs.length*4;
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'v3',v:{x:x[i]||0,y:y[i]||0,z:z[i]||0}};
            }
          }
          else if(typeCode===0x10){
            if(dp>=data.length) continue;
            var rotType=data[dp]; dp++;
            var cfArr=[];
            for(var i=0;i<refs.length && dp+11<data.length;i++){
              var px=rf32(data,dp); dp+=4;
              var py=rf32(data,dp); dp+=4;
              var pz=rf32(data,dp); dp+=4;
              var r00=1, r01=0, r02=0, r10=0, r11=1, r12=0, r20=0, r21=0, r22=1;
              if (rotType === 0) {
                if (dp + 35 < data.length) {
                  r00=rf32(data,dp); dp+=4; r01=rf32(data,dp); dp+=4; r02=rf32(data,dp); dp+=4;
                  r10=rf32(data,dp); dp+=4; r11=rf32(data,dp); dp+=4; r12=rf32(data,dp); dp+=4;
                  r20=rf32(data,dp); dp+=4; r21=rf32(data,dp); dp+=4; r22=rf32(data,dp); dp+=4;
                }
              }
              cfArr.push({x:px,y:py,z:pz,r00:r00,r01:r01,r02:r02,r10:r10,r11:r11,r12:r12,r20:r20,r21:r21,r22:r22,rotType:rotType});
            }
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'cf',v:cfArr[i]||{x:0,y:0,z:0}};
            }
          }
          else if(typeCode===0x12){
            var codes=decDelta32(data.subarray(dp,dp+refs.length*4));
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'enum',v:codes[i]||0};
            }
          }
          else if(typeCode===0x13){
            var refIds=decDelta32(data.subarray(dp,dp+refs.length*4));
            for(var i=0;i<refs.length;i++){
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'ref',v:refIds[i]||0};
            }
          }
          else if(typeCode===0x15){
            var indices=decDelta32(data.subarray(dp,dp+refs.length*4));
            for(var i=0;i<refs.length;i++){
              var idx=indices[i];
              var str=(idx>=0&&idx<sharedStrings.length)?sharedStrings[idx]:'';
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'str',v:str};
            }
          }
          else if(typeCode===0x16){
            for(var i=0;i<refs.length && dp<data.length;i++){
              var present=(data[dp]===1); dp++;
              if(present && dp+11<data.length){
                var px=rf32(data,dp); dp+=4;
                var py=rf32(data,dp); dp+=4;
                var pz=rf32(data,dp); dp+=4;
                if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'cf',v:{x:px,y:py,z:pz}};
              } else {
                if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'nil',v:null};
              }
            }
          }
          else if(typeCode===0x17){
            for(var i=0;i<refs.length && dp<data.length;i++){
              var bytes16=Array.from(data.subarray(dp,dp+16));
              dp+=16;
              var hex=bytes16.map(function(b){return b.toString(16).padStart(2,'0');}).join('');
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'id',v:hex};
            }
          }
          else if(typeCode===0x19){
            for(var i=0;i<refs.length && dp<data.length;i++){
              var fam=rStr(data,dp); dp=fam.end;
              if(dp+2>data.length) break;
              var weight=ru32(data,dp)&0xffff; dp+=2;
              if(dp>=data.length) break;
              var style=data[dp]; dp++;
              var fontStr=fam.val+' '+weight+' '+style;
              if(INST_MAP[refs[i]]) INST_MAP[refs[i]].props[propName.val]={t:'font',v:fontStr};
            }
          }
        } catch(pex) {
        }
        propsCount++;
      }
      else if(chunkName==='PRNT'){
        var dp=0;
        if(dp>=data.length) continue;
        var ver=data[dp]; dp++;
        if(dp+4>data.length) continue;
        var objCnt=ri32(data,dp); dp+=4;
        if(objCnt<0||objCnt>1000000) continue;
        var refs=decDelta32(data.subarray(dp,dp+objCnt*4)); dp+=objCnt*4;
        var pars=decDelta32(data.subarray(dp,dp+objCnt*4)); dp+=objCnt*4;
        for(var i=0;i<refs.length;i++){
          var child=INST_MAP[refs[i]], parent=INST_MAP[pars[i]];
          if(child){
            child.parentId=pars[i];
            if(parent) parent.children.push(refs[i]);
          }
        }
      }
      else if(chunkName==='SSTR'){
        var dp=0;
        if(dp+4>data.length) continue;
        var ver=ri32(data,dp); dp+=4;
        if(dp+4>data.length) continue;
        var cnt=ri32(data,dp); dp+=4;
        if(cnt<0||cnt>100000) continue;
        for(var i=0;i<cnt && dp<data.length;i++){
          var hash=data.subarray(dp,dp+16); dp+=16;
          var s=rStr(data,dp); dp=s.end;
          sharedStrings.push(s.val);
        }
      }
      else if(chunkName==='END\0'){
        break;
      }
    } catch(chunkEx) {
    }
  }

  for(var i=0;i<INST_LIST.length;i++){
    var inst=INST_LIST[i];
    if(inst.props.Name && inst.props.Name.v) inst.name=inst.props.Name.v;
  }

  setStatus('Successfully processed: '+INST_LIST.length+' instances.');
  buildUI();
}

function parseXML(txt) {
  INST_MAP={}; INST_LIST=[]; CLASS_MAP={}; SELECTED_INSTS=[];

  try {
    var parser = new DOMParser();
    var doc = parser.parseFromString(txt, "text/xml");

    var parseError = doc.querySelector('parsererror');
    if(parseError) throw new Error('XML parse error');

    var items = doc.querySelectorAll('Item');
    var maxId=0;
    for(var i=0;i<items.length;i++){
      var it=items[i];
      var cls=it.getAttribute('class')||'Unknown';
      if (IGNORED_CLASSES.indexOf(cls) !== -1) continue;

      var refId=parseInt(it.getAttribute('referent')||'0');
      if(refId>maxId) maxId=refId;

      var inst={id:refId,cls:cls,name:cls,props:{},children:[],parentId:-1};
      INST_MAP[refId]=inst;
      INST_LIST.push(inst);

      var props=it.querySelectorAll(':scope > Properties > *');
      for(var j=0;j<props.length;j++){
        var p=props[j];
        var pName=p.getAttribute('name')||'';
        var pType=p.tagName.toLowerCase();
        var pVal=p.textContent||'';

        if(pType==='string'||pType==='protectedstring'||pType==='binarystring'){
          inst.props[pName]={t:'str',v:pVal};
        }
        else if(pType==='bool'){
          inst.props[pName]={t:'bool',v:(pVal==='true')};
        }
        else if(pType==='int'||pType==='int64'){
          inst.props[pName]={t:'num',v:parseInt(pVal)||0};
        }
        else if(pType==='float'||pType==='double'){
          inst.props[pName]={t:'num',v:parseFloat(pVal)||0};
        }
        else if(pType==='token'||pType==='enum'){
          inst.props[pName]={t:'enum',v:pVal};
        }
        else if(pType==='color3'){
          var rgb=pVal.match(/[\d.]+/g)||['0','0','0'];
          inst.props[pName]={t:'col3',v:{r:parseFloat(rgb[0])||0,g:parseFloat(rgb[1])||0,b:parseFloat(rgb[2])||0}};
        }
        else if(pType==='vector3'){
          var xyz=pVal.match(/[\d.-]+/g)||['0','0','0'];
          inst.props[pName]={t:'v3',v:{x:parseFloat(xyz[0])||0,y:parseFloat(xyz[1])||0,z:parseFloat(xyz[2])||0}};
        }
        else if(pType==='vector2'){
          var xy=pVal.match(/[\d.-]+/g)||['0','0'];
          inst.props[pName]={t:'v2',v:{x:parseFloat(xy[0])||0,y:parseFloat(xy[1])||0}};
        }
        else if(pType==='udim2'){
          var parts=pVal.match(/[\d.-]+/g)||['0','0','0','0'];
          inst.props[pName]={t:'udim2',v:{xs:parseFloat(parts[0])||0,xo:parseInt(parts[1])||0,ys:parseFloat(parts[2])||0,yo:parseInt(parts[3])||0}};
        }
        else if(pType==='coordinateframe'||pType==='cframe'){
          var nums=pVal.match(/[\d.-]+/g)||['0','0','0'];
          inst.props[pName]={t:'cf',v:{x:parseFloat(nums[0])||0,y:parseFloat(nums[1])||0,z:parseFloat(nums[2])||0}};
        }
        else if(pType==='ref'){
          inst.props[pName]={t:'ref',v:parseInt(pVal)||0};
        }
        else {
          inst.props[pName]={t:'str',v:pVal};
        }
      }

      if(inst.props.Name) inst.name=inst.props.Name.v;
    }

    for(var i=0;i<items.length;i++){
      var it=items[i];
      var refId=parseInt(it.getAttribute('referent')||'0');
      var inst=INST_MAP[refId];
      if(!inst) continue;

      var parentItem=it.parentElement;
      while(parentItem && parentItem.tagName!=='Item' && parentItem.tagName!=='roblox'){
        parentItem=parentItem.parentElement;
      }
      if(parentItem && parentItem.tagName==='Item'){
        var parId=parseInt(parentItem.getAttribute('referent')||'0');
        inst.parentId=parId;
        if(INST_MAP[parId]) INST_MAP[parId].children.push(refId);
      }
    }

    setStatus('Successfully processed: '+INST_LIST.length+' instances (XML).');
    buildUI();
  } catch(ex) {
    throw new Error('XML parsing failed: '+ex.message);
  }
}

function getIconForClass(cls) {
  const iconMap = {
    'Workspace': 'fa-solid fa-globe',
    'Players': 'fa-solid fa-users',
    'Lighting': 'fa-regular fa-lightbulb',
    'ReplicatedStorage': 'fa-solid fa-box-archive',
    'ServerStorage': 'fa-solid fa-box-archive',
    'ReplicatedFirst': 'fa-solid fa-box-archive',
    'ServerScriptService': 'fa-solid fa-gears',
    'StarterGui': 'fa-solid fa-window-maximize',
    'StarterPack': 'fa-solid fa-box',
    'StarterPlayer': 'fa-solid fa-user',
    'SoundService': 'fa-solid fa-volume-high',
    'TweenService': 'fa-solid fa-bolt',
    'RunService': 'fa-solid fa-play',
    'CollectionService': 'fa-solid fa-tags',
    'MarketplaceService': 'fa-solid fa-cart-shopping',
    'BadgeService': 'fa-solid fa-certificate',
    'TeleportService': 'fa-solid fa-door-open',
    'PathfindingService': 'fa-solid fa-route',
    'InsertService': 'fa-solid fa-file-import',
    'TextService': 'fa-solid fa-font',
    'HttpService': 'fa-solid fa-network-wired',
    'LocalizationService': 'fa-solid fa-language',
    'VoiceChatService': 'fa-solid fa-microphone',
    'PhysicsService': 'fa-solid fa-atom',
    'Teams': 'fa-solid fa-people-group',
    'Chat': 'fa-solid fa-comments',
    'DataStoreService': 'fa-solid fa-database',
    'MemoryStoreService': 'fa-solid fa-memory',

    'Folder': 'fa-solid fa-folder',
    'Configuration': 'fa-solid fa-sliders',

    'Part': 'fa-solid fa-cube',
    'WedgePart': 'fa-solid fa-play',
    'CornerWedgePart': 'fa-solid fa-shapes',
    'TrussPart': 'fa-solid fa-bars-staggered',
    'UnionOperation': 'fa-solid fa-shapes',
    'NegateOperation': 'fa-solid fa-minus-square',
    'PartOperation': 'fa-solid fa-shapes',
    'MeshPart': 'fa-solid fa-cubes',
    'Model': 'fa-solid fa-boxes-stacked',
    'SpawnLocation': 'fa-solid fa-location-crosshairs',
    'Terrain': 'fa-solid fa-mountain',

    'PointLight': 'fa-solid fa-lightbulb',
    'SpotLight': 'fa-solid fa-lightbulb',
    'SurfaceLight': 'fa-solid fa-lightbulb',
    'Atmosphere': 'fa-solid fa-smog',
    'Clouds': 'fa-solid fa-cloud',
    'Sky': 'fa-solid fa-cloud-sun',
    'BloomEffect': 'fa-solid fa-sun',
    'BlurEffect': 'fa-solid fa-eye-slash',
    'ColorCorrectionEffect': 'fa-solid fa-sliders',
    'ColorGradingEffect': 'fa-solid fa-palette',
    'DepthOfFieldEffect': 'fa-solid fa-camera',
    'SunRaysEffect': 'fa-solid fa-sun',

    'TextBox': 'fa-solid fa-i-cursor',
    'ImageButton': 'fa-solid fa-image',
    'ImageLabel': 'fa-solid fa-image',
    'ViewportFrame': 'fa-solid fa-display',
    'VideoFrame': 'fa-solid fa-video',
    'CanvasGroup': 'fa-solid fa-layer-group',
    'ScrollingFrame': 'fa-solid fa-scroll',
    'BillboardGui': 'fa-solid fa-tv',
    'SurfaceGui': 'fa-solid fa-tv',
    'ScreenGui': 'fa-solid fa-window-maximize',
    'Frame': 'fa-regular fa-square',
    'TextLabel': 'fa-solid fa-font',
    'TextButton': 'fa-solid fa-hand-pointer',
    'UIGridLayout': 'fa-solid fa-table-cells',
    'UIPageLayout': 'fa-solid fa-file-lines',
    'UITableLayout': 'fa-solid fa-table',
    'UIAspectRatioConstraint': 'fa-solid fa-expand',
    'UIScale': 'fa-solid fa-up-right-and-down-left-from-center',
    'UIStroke': 'fa-solid fa-border-all',
    'UIPadding': 'fa-solid fa-expand',
    'UITextSizeConstraint': 'fa-solid fa-text-height',
    'UITextStyle': 'fa-solid fa-font',

    'Humanoid': 'fa-solid fa-person',
    'HumanoidDescription': 'fa-solid fa-address-card',
    'Animator': 'fa-solid fa-person-running',
    'Animation': 'fa-solid fa-film',
    'AnimationTrack': 'fa-solid fa-film',
    'AnimationController': 'fa-solid fa-gamepad',
    'Accessory': 'fa-solid fa-hat-cowboy',
    'Hat': 'fa-solid fa-hat-wizard',
    'Shirt': 'fa-solid fa-shirt',
    'Pants': 'fa-solid fa-user-ninja',
    'ShirtGraphic': 'fa-solid fa-image',
    'CharacterMesh': 'fa-solid fa-child',
    'BodyColors': 'fa-solid fa-palette',

    'RopeConstraint': 'fa-solid fa-link',
    'RodConstraint': 'fa-solid fa-link',
    'RigidConstraint': 'fa-solid fa-link',
    'PrismaticConstraint': 'fa-solid fa-link',
    'PlaneConstraint': 'fa-solid fa-link',
    'NoCollisionConstraint': 'fa-solid fa-ban',
    'BallSocketConstraint': 'fa-solid fa-link',
    'HingeConstraint': 'fa-solid fa-dharmachakra',
    'CylindricalConstraint': 'fa-solid fa-link',
    'SpringConstraint': 'fa-solid fa-arrow-up-down',
    'TorsionSpringConstraint': 'fa-solid fa-rotate',
    'WeldConstraint': 'fa-solid fa-link',
    'Weld': 'fa-solid fa-link',
    'Motor6D': 'fa-solid fa-gear',
    'AlignPosition': 'fa-solid fa-arrows-to-dot',
    'Attachment': 'fa-solid fa-paperclip',

    'Explosion': 'fa-solid fa-burst',
    'Highlight': 'fa-solid fa-highlighter',
    'Beam': 'fa-solid fa-bolt',
    'Trail': 'fa-solid fa-wave-square',
    'Fire': 'fa-solid fa-fire',
    'Smoke': 'fa-solid fa-smog',
    'Sparkles': 'fa-solid fa-star',
    'ParticleEmitter': 'fa-solid fa-wand-magic-sparkles',

    'ClickDetector': 'fa-solid fa-hand-pointer',
    'ProximityPrompt': 'fa-solid fa-circle-dot',
    'TouchTransmitter': 'fa-solid fa-hand-dots',
    'DragDetector': 'fa-solid fa-up-down-left-right',
    'Mesh': 'fa-solid fa-draw-polygon',
    'BlockMesh': 'fa-solid fa-cube',
    'CylinderMesh': 'fa-solid fa-database',
    'SpecialMesh': 'fa-solid fa-shapes',
    'BevelMesh': 'fa-solid fa-shapes',

    'DataStore': 'fa-solid fa-database',
    'OrderedDataStore': 'fa-solid fa-list-ol',
    'RemoteEvent': 'fa-solid fa-satellite-dish',
    'RemoteFunction': 'fa-solid fa-tower-broadcast',
    'BindableEvent': 'fa-solid fa-bolt',
    'BindableFunction': 'fa-solid fa-code-fork',

    'BrickColorValue': 'fa-solid fa-palette',
    'CFrameValue': 'fa-solid fa-arrows-up-down-left-right',
    'Color3Value': 'fa-solid fa-palette',
    'DoubleConstrainedValue': 'fa-solid fa-hashtag',
    'IntConstrainedValue': 'fa-solid fa-hashtag',
    'BinaryStringValue': 'fa-solid fa-file-binary',
    'RayValue': 'fa-solid fa-arrow-trend-up',
    'NumberSequenceValue': 'fa-solid fa-chart-line',
    'IntValue': 'fa-solid fa-hashtag',
    'NumberValue': 'fa-solid fa-hashtag',
    'StringValue': 'fa-solid fa-quote-right',
    'BoolValue': 'fa-solid fa-toggle-on',
    'ObjectValue': 'fa-solid fa-cube',
    'Vector3Value': 'fa-solid fa-arrows-up-down-left-right',

    'Script': 'fa-solid fa-file-code',
    'LocalScript': 'fa-solid fa-file-code',
    'ModuleScript': 'fa-solid fa-scroll',
    'Sound': 'fa-solid fa-volume-high',
    'SoundGroup': 'fa-solid fa-sliders',
    'Camera': 'fa-solid fa-video'
  };

  if (iconMap[cls]) return iconMap[cls];
  if (cls.endsWith('Service')) return 'fa-solid fa-gears';
  if (cls.endsWith('Value')) return 'fa-solid fa-tag';
  if (cls.endsWith('Constraint')) return 'fa-solid fa-link';
  if (cls.endsWith('Gui') || cls.startsWith('UI')) return 'fa-solid fa-window-maximize';
  if (cls.includes('Light')) return 'fa-solid fa-lightbulb';
  if (cls.includes('Mesh')) return 'fa-solid fa-shapes';

  return 'fa-regular fa-file';
}

function getItemCategory(cls) {
  if (cls === 'Script') return 'script';
  if (cls === 'LocalScript') return 'localScript';
  if (cls === 'ModuleScript') return 'moduleScript';

  var services = ['Players', 'Workspace', 'Lighting', 'ReplicatedStorage', 'ReplicatedFirst', 'ServerStorage', 'ServerScriptService', 'StarterGui', 'StarterPack', 'StarterPlayer', 'RunService', 'TweenService', 'CollectionService', 'MarketplaceService', 'BadgeService', 'TeleportService', 'PathfindingService', 'InsertService', 'TextService', 'HttpService', 'LocalizationService', 'VoiceChatService', 'PhysicsService', 'Teams', 'Chat', 'SoundService', 'DataStoreService', 'MemoryStoreService'];
  if (services.includes(cls) || cls.endsWith('Service')) return 'service';

  var values = ['BrickColorValue', 'CFrameValue', 'Color3Value', 'DoubleConstrainedValue', 'IntConstrainedValue', 'BinaryStringValue', 'RayValue', 'NumberSequenceValue', 'IntValue', 'NumberValue', 'StringValue', 'BoolValue', 'ObjectValue', 'Vector3Value', 'RayValue'];
  if (values.includes(cls) || cls.endsWith('Value')) return 'valueObject';

  var guis = ['TextBox', 'ImageButton', 'ImageLabel', 'ViewportFrame', 'VideoFrame', 'CanvasGroup', 'ScrollingFrame', 'BillboardGui', 'SurfaceGui', 'UIGridLayout', 'UIPageLayout', 'UITableLayout', 'UIAspectRatioConstraint', 'UIScale', 'UIStroke', 'UIPadding', 'UITextSizeConstraint', 'UITextStyle', 'ScreenGui', 'Frame', 'TextLabel', 'TextButton', 'UICorner', 'UIListLayout'];
  if (guis.includes(cls) || cls.endsWith('Gui') || cls.startsWith('UI')) return 'gui';

  var spatial3D = ['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation', 'NegateOperation', 'PartOperation', 'MeshPart', 'Model', 'SpawnLocation', 'Terrain', 'Accoutrement', 'Tool'];
  if (spatial3D.includes(cls)) return '3dInstance';

  var avatar = ['Humanoid', 'HumanoidDescription', 'Animator', 'Animation', 'AnimationTrack', 'AnimationController', 'Accessory', 'Hat', 'Shirt', 'Pants', 'ShirtGraphic', 'CharacterMesh', 'BodyColors'];
  if (avatar.includes(cls)) return 'avatar';

  var constraints = ['RopeConstraint', 'RodConstraint', 'RigidConstraint', 'PrismaticConstraint', 'PlaneConstraint', 'NoCollisionConstraint', 'BallSocketConstraint', 'HingeConstraint', 'CylindricalConstraint', 'SpringConstraint', 'TorsionSpringConstraint', 'WeldConstraint', 'Weld', 'Motor6D', 'AlignPosition', 'Attachment'];
  if (constraints.includes(cls) || cls.endsWith('Constraint')) return 'constraint';

  var detection = ['ClickDetector', 'ProximityPrompt', 'TouchTransmitter', 'DragDetector', 'Mesh', 'BlockMesh', 'CylinderMesh', 'SpecialMesh', 'BevelMesh'];
  if (detection.includes(cls) || cls.endsWith('Mesh') || cls.endsWith('Detector')) return 'detection';

  var data = ['DataStore', 'OrderedDataStore', 'RemoteEvent', 'RemoteFunction', 'BindableEvent', 'BindableFunction'];
  if (data.includes(cls) || cls.includes('DataStore') || cls.includes('Remote') || cls.includes('Bindable')) return 'data';

  var effects = ['Explosion', 'Highlight', 'Beam', 'Trail', 'Fire', 'Smoke', 'Sparkles', 'ParticleEmitter'];
  if (effects.includes(cls)) return 'effect';

  var sounds = ['Sound', 'SoundGroup', 'SoundEffect', 'EqualizerSoundEffect', 'ReverbSoundEffect', 'PitchShiftSoundEffect', 'EchoSoundEffect', 'DistortionSoundEffect', 'ChorusSoundEffect', 'CompressorSoundEffect', 'FlangeSoundEffect'];
  if (sounds.includes(cls) || cls.includes('Sound')) return 'sound';

  var folders = ['Folder', 'Configuration'];
  if (folders.includes(cls)) return 'folder';

  var atmosphere = ['PointLight', 'SpotLight', 'SurfaceLight', 'Atmosphere', 'Clouds', 'Sky', 'BloomEffect', 'BlurEffect', 'ColorCorrectionEffect', 'ColorGradingEffect', 'DepthOfFieldEffect', 'SunRaysEffect'];
  if (atmosphere.includes(cls) || cls.toLowerCase().includes('light') || cls.endsWith('Effect')) return 'atmosphere';

  return 'misc';
}

function matchesFilter(inst) {
  if (!inst.props || Object.keys(inst.props).length === 0) {
    var isScript = (inst.cls === 'Script' || inst.cls === 'LocalScript' || inst.cls === 'ModuleScript');
    if (isScript) return false;
  }

  var cat = getItemCategory(inst.cls);
  if (ACTIVE_FILTERS[cat]) return true;

  for (var i = 0; i < inst.children.length; i++) {
    var child = INST_MAP[inst.children[i]];
    if (child && matchesFilter(child)) return true;
  }
  return false;
}

function instanceSelfMatchesSearch(inst) {
  if (!SEARCH_QUERY) return true;
  return (inst.name && inst.name.toLowerCase().indexOf(SEARCH_QUERY) !== -1) ||
         (inst.cls && inst.cls.toLowerCase().indexOf(SEARCH_QUERY) !== -1);
}

function matchesSearchAndFilter(inst) {
  if (!matchesFilter(inst)) return false;
  if (instanceSelfMatchesSearch(inst)) return true;

  for (var i = 0; i < inst.children.length; i++) {
    var child = INST_MAP[inst.children[i]];
    if (child && matchesSearchAndFilter(child)) return true;
  }
  return false;
}

function buildUI() {
  document.getElementById('mainArea').style.display='grid';

  var uniqueClasses={};
  var scriptCount=0;
  for(var i=0;i<INST_LIST.length;i++){
    uniqueClasses[INST_LIST[i].cls]=1;
    if(INST_LIST[i].cls==='Script'||INST_LIST[i].cls==='LocalScript'||INST_LIST[i].cls==='ModuleScript') {
      if (Object.keys(INST_LIST[i].props).length > 0) {
        scriptCount++;
      }
    }
  }
  document.getElementById('statInst').textContent=INST_LIST.length;
  document.getElementById('statCls').textContent=Object.keys(uniqueClasses).length;
  document.getElementById('statScripts').textContent=scriptCount;
  document.getElementById('statsBar').style.display='grid';

  buildTree();
}

function buildTree() {
  var container=document.getElementById('treeContainer');
  container.innerHTML='';

  var roots=INST_LIST.filter(function(i){return !INST_MAP[i.parentId];});
  var isPartialFilter = Object.values(ACTIVE_FILTERS).some(function(v){ return !v; });

  function makeNode(inst, depth) {
    if (!matchesSearchAndFilter(inst)) return null;

    var matchingChildren = inst.children.filter(function(childId) {
      var child = INST_MAP[childId];
      return child && matchesSearchAndFilter(child);
    });

    var hasKids = matchingChildren.length > 0;
    var wrap = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (depth * 16 + 4) + 'px';
    if (SELECTED_INSTS.indexOf(inst) >= 0) {
      row.classList.add('sel');
    }

    var chevron = document.createElement('i');
    if (hasKids) {
      chevron.className = 'fa-solid fa-chevron-right tree-chevron';
    } else {
      chevron.className = 'tree-chevron-empty';
    }

    var icon = document.createElement('i');
    icon.className = getIconForClass(inst.cls) + ' tree-icon';

    var textNode = document.createElement('span');
    textNode.className = 'tree-text';
    textNode.textContent = inst.name;

    row.appendChild(chevron);
    row.appendChild(icon);
    row.appendChild(textNode);

    var childWrap = document.createElement('div');
    var isAutoExpanded = (isPartialFilter || SEARCH_QUERY !== '') && hasKids;
    childWrap.style.display = isAutoExpanded ? 'block' : 'none';
    if (isAutoExpanded) {
      chevron.classList.add('open');
    }

    if (hasKids) {
      chevron.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = (childWrap.style.display !== 'none');
        childWrap.style.display = isOpen ? 'none' : 'block';
        if (isOpen) {
          chevron.classList.remove('open');
        } else {
          chevron.classList.add('open');
        }
      });
    }

    row.addEventListener('click', function(e){
      e.stopPropagation();

      var isMulti = IS_MULTI_SELECT_MODE || e.ctrlKey || e.metaKey || e.shiftKey;

      if (isMulti) {
        var idx = SELECTED_INSTS.indexOf(inst);
        if (idx >= 0) {
          SELECTED_INSTS.splice(idx, 1);
          row.classList.remove('sel');
        } else {
          SELECTED_INSTS.push(inst);
          row.classList.add('sel');
        }
      } else {
        var prevs = document.querySelectorAll('#treeContainer .sel');
        prevs.forEach(function(el){ el.classList.remove('sel'); });
        SELECTED_INSTS = [inst];
        row.classList.add('sel');

        if (hasKids && e.target !== chevron) {
          var isOpen = (childWrap.style.display !== 'none');
          childWrap.style.display = isOpen ? 'none' : 'block';
          if (isOpen) {
            chevron.classList.remove('open');
          } else {
            chevron.classList.add('open');
          }
        }
      }

      showProps();
    });

    wrap.appendChild(row);
    if (hasKids) {
      for (var i = 0; i < matchingChildren.length; i++) {
        var child = INST_MAP[matchingChildren[i]];
        if (child) {
          var childNode = makeNode(child, depth + 1);
          if (childNode) childWrap.appendChild(childNode);
        }
      }
      wrap.appendChild(childWrap);
    }
    return wrap;
  }

  for (var i = 0; i < roots.length; i++) {
    var rootNode = makeNode(roots[i], 0);
    if (rootNode) container.appendChild(rootNode);
  }
}

function formatLuaValue(p, propName) {
  if (!p || p.v === null || p.v === undefined) return null;
  switch(p.t) {
    case 'str':
      return '"' + String(p.v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    case 'bool':
      return p.v ? 'true' : 'false';
    case 'num':
      return fn(p.v);
    case 'col3':
      var r8 = Math.round((p.v.r || 0) * 255);
      var g8 = Math.round((p.v.g || 0) * 255);
      var b8 = Math.round((p.v.b || 0) * 255);
      return 'Color3.fromRGB(' + r8 + ', ' + g8 + ', ' + b8 + ')';
    case 'v3':
      return 'Vector3.new(' + fn(p.v.x) + ', ' + fn(p.v.y) + ', ' + fn(p.v.z) + ')';
    case 'v2':
      return 'Vector2.new(' + fn(p.v.x) + ', ' + fn(p.v.y) + ')';
    case 'cf':
      if (p.v.r00 !== undefined && p.v.rotType === 0) {
        return 'CFrame.new(' + fn(p.v.x) + ', ' + fn(p.v.y) + ', ' + fn(p.v.z) + ', ' + fn(p.v.r00) + ', ' + fn(p.v.r01) + ', ' + fn(p.v.r02) + ', ' + fn(p.v.r10) + ', ' + fn(p.v.r11) + ', ' + fn(p.v.r12) + ')';
      }
      return 'CFrame.new(' + fn(p.v.x) + ', ' + fn(p.v.y) + ', ' + fn(p.v.z) + ')';
    case 'udim2':
      return 'UDim2.new(' + fn(p.v.xs) + ', ' + p.v.xo + ', ' + fn(p.v.ys) + ', ' + p.v.yo + ')';
    case 'udim':
      return 'UDim.new(' + fn(p.v.s) + ', ' + p.v.o + ')';
    case 'bc':
      return 'BrickColor.new(' + p.v + ')';
    case 'enum':
      var enumType = propName ? ENUM_PROP_MAP[propName] : null;
      if (typeof p.v === 'string') {
        if (enumType) return 'Enum.' + enumType + '.' + p.v;
        return 'Enum.' + propName + '.' + p.v;
      } else {
        if (enumType) return '(Enum.' + enumType + ':GetEnumItems()[' + ((p.v || 0) + 1) + '] or ' + p.v + ')';
        return p.v;
      }
    case 'font':
      if (typeof p.v === 'string') {
        var fontParts = p.v.split(' ');
        var fontName = fontParts[0] || 'SourceSans';
        return 'Font.fromName("' + fontName + '")';
      }
      return 'Font.fromEnum(Enum.Font.SourceSans)';
    default:
      return null;
  }
}

function generateLuaForInstance(targetList) {
  if (!Array.isArray(targetList)) targetList = [targetList];
  var code = [];
  var varCounter = 0;
  var rootVars = [];

  function cleanVarName(name) {
    var v = String(name || 'Object').replace(/[^a-zA-Z0-9_]/g, '_');
    if (!v || /^[0-9]/.test(v)) v = 'obj_' + v;
    return v;
  }

  function processNode(inst, parentVar, indentLevel) {
    if (IGNORED_CLASSES.indexOf(inst.cls) !== -1) return;

    varCounter++;
    var varName = cleanVarName(inst.name) + '_' + varCounter;
    if (!parentVar) rootVars.push(varName);

    var indent = '  '.repeat(indentLevel);
    code.push(indent + 'local ' + varName + ' = Instance.new("' + inst.cls + '")');

    var keys = Object.keys(inst.props);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (IGNORED_PROPS.indexOf(k) !== -1) continue;
      var prop = inst.props[k];
      var valStr = formatLuaValue(prop, k);
      if (valStr !== null && valStr !== undefined) {
        code.push(indent + varName + '.' + k + ' = ' + valStr);
      }
    }

    if (parentVar) {
      code.push(indent + varName + '.Parent = ' + parentVar);
    } else {
      var cat = getItemCategory(inst.cls);
      if (CURRENT_LUA_VARIANT === 'module') {
        code.push(indent + varName + '.Parent = parent or workspace');
      } else if (CURRENT_LUA_VARIANT === 'local') {
        var defaultParent = 'workspace';
        if (cat === 'gui') defaultParent = 'game.Players.LocalPlayer:WaitForChild("PlayerGui")';
        else if (cat === 'atmosphere') defaultParent = 'game.Lighting';
        code.push(indent + varName + '.Parent = ' + defaultParent);
      } else {
        var defaultParent = 'workspace';
        if (cat === 'gui') defaultParent = 'game.StarterGui';
        else if (cat === 'atmosphere') defaultParent = 'game.Lighting';
        code.push(indent + varName + '.Parent = ' + defaultParent);
      }
    }
    code.push('');

    for (var j = 0; j < inst.children.length; j++) {
      var child = INST_MAP[inst.children[j]];
      if (child) {
        processNode(child, varName, indentLevel);
      }
    }
  }

  var indentLevel = (CURRENT_LUA_VARIANT === 'module') ? 1 : 0;

  if (CURRENT_LUA_VARIANT === 'local') {
    var hasGui = targetList.some(function(t) { return getItemCategory(t.cls) === 'gui'; });
    if (hasGui) {
      code.push('local Players = game:GetService("Players")');
      code.push('local LocalPlayer = Players.LocalPlayer');
      code.push('');
    }
  } else if (CURRENT_LUA_VARIANT === 'module') {
    code.push('local Module = {}');
    code.push('');
    code.push('function Module.Create(parent)');
  }

  for (var i = 0; i < targetList.length; i++) {
    if (targetList[i]) processNode(targetList[i], null, indentLevel);
  }

  if (CURRENT_LUA_VARIANT === 'module') {
    if (rootVars.length === 1) {
      code.push('  return ' + rootVars[0]);
    } else if (rootVars.length > 1) {
      code.push('  return { ' + rootVars.join(', ') + ' }');
    }
    code.push('end');
    code.push('');
    code.push('return Module');
  }

  return code.join('\n');
}

function updateGuideTree(inst) {
  var box = document.getElementById('guideTreeBox');
  if (!box) return;

  if (!inst || (inst.cls !== 'Script' && inst.cls !== 'LocalScript' && inst.cls !== 'ModuleScript')) {
    box.style.display = 'none';
    return;
  }

  var pathHtml = '';
  if (inst.cls === 'Script') {
    pathHtml = '<span class="guide-tree-path"><i class="fa-solid fa-gamepad"></i> Explorer</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path"><i class="fa-solid fa-gears"></i> ServerScriptService</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path" style="color:var(--success);"><i class="fa-solid fa-file-code"></i> ' + esc(inst.name) + '</span>';
  } else if (inst.cls === 'LocalScript') {
    pathHtml = '<span class="guide-tree-path"><i class="fa-solid fa-gamepad"></i> Explorer</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path"><i class="fa-solid fa-user"></i> StarterPlayer</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path"><i class="fa-solid fa-folder"></i> StarterPlayerScripts</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path" style="color:var(--success);"><i class="fa-solid fa-file-code"></i> ' + esc(inst.name) + '</span>';
  } else if (inst.cls === 'ModuleScript') {
    pathHtml = '<span class="guide-tree-path"><i class="fa-solid fa-gamepad"></i> Explorer</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path"><i class="fa-solid fa-box-archive"></i> ReplicatedStorage</span> <i class="fa-solid fa-chevron-right" style="font-size:10px;color:var(--text-muted);"></i> <span class="guide-tree-path" style="color:var(--success);"><i class="fa-solid fa-scroll"></i> ' + esc(inst.name) + '</span>';
  }

  var warningHtml = '<div style="color:var(--danger);font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-triangle-exclamation"></i> (This guide is only partially accurate)</div>';

  box.innerHTML = warningHtml + '<div style="display:flex;align-items:center;gap:6px;font-weight:600;color:var(--primary);"><i class="fa-solid fa-sitemap"></i> Tutorial:</div><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' + pathHtml + '</div>';
  box.style.display = 'flex';
}

function showProps() {
  var c = document.getElementById('propsContainer');
  var scriptSec = document.getElementById('scriptSection');
  var scriptArea = document.getElementById('scriptArea');
  var scriptTitle = document.getElementById('scriptTitle');
  var variantSelector = document.getElementById('variantSelector');

  if (!SELECTED_INSTS || SELECTED_INSTS.length === 0) {
    c.innerHTML = 'Select an instance in Explorer to view properties.';
    scriptSec.style.display = 'none';
    updateGuideTree(null);
    return;
  }

  if (SELECTED_INSTS.length === 1) {
    var inst = SELECTED_INSTS[0];
    var isScriptObj = (inst.cls === 'Script' || inst.cls === 'LocalScript' || inst.cls === 'ModuleScript');

    var html = '<div style="margin-bottom:12px"><b>' + esc(inst.name) + '</b> <span style="color:var(--text-muted)">[' + esc(inst.cls) + ']</span><br>';
    html += '<span style="font-size:11px;color:var(--text-muted)">RefId: ' + inst.id + '</span></div>';

    var keys = Object.keys(inst.props);
    if (!keys.length) {
      c.innerHTML = 'Select an instance in Explorer to view properties.';
      scriptSec.style.display = 'none';
      updateGuideTree(null);
      return;
    } else {
      html += '<table>';
      html += '<colgroup><col width="140"><col></colgroup>';
      html += '<tr><th align="left">Property</th><th align="left">Value</th></tr>';
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var prop = inst.props[k];
        html += '<tr><td style="overflow:hidden;word-break:break-word;font-weight:500">' + esc(k) + '</td><td style="overflow:hidden;word-break:break-word">' + propHTML(prop, k) + '</td></tr>';
      }
      html += '</table>';
    }
    c.innerHTML = html;

    scriptSec.style.display = 'flex';
    if (isScriptObj) {
      variantSelector.style.display = 'none';
      scriptTitle.textContent = 'Script Viewer: ' + inst.name + ' (' + inst.cls + ')';
      scriptArea.value = (inst.props.Source && typeof inst.props.Source.v === 'string') ? inst.props.Source.v : '';
      updateGuideTree(inst);
    } else {
      variantSelector.style.display = 'flex';
      scriptTitle.textContent = 'Lua Generator: ' + inst.name + ' (' + inst.cls + ')';
      scriptArea.value = generateLuaForInstance([inst]);
      updateGuideTree(null);
    }
  } else {
    variantSelector.style.display = 'flex';
    var html = '<div style="margin-bottom:12px"><b>' + SELECTED_INSTS.length + ' Items Selected</b><br>';
    html += '<span style="font-size:11px;color:var(--text-muted)">Multi-selection active</span></div>';
    html += '<ul style="padding-left:16px;font-size:12px;color:var(--text-main);">';
    for (var i = 0; i < Math.min(SELECTED_INSTS.length, 10); i++) {
      html += '<li><b>' + esc(SELECTED_INSTS[i].name) + '</b> <span style="color:var(--text-muted)">[' + esc(SELECTED_INSTS[i].cls) + ']</span></li>';
    }
    if (SELECTED_INSTS.length > 10) {
      html += '<li style="color:var(--text-muted)">... and ' + (SELECTED_INSTS.length - 10) + ' more</li>';
    }
    html += '</ul>';
    c.innerHTML = html;

    scriptSec.style.display = 'flex';
    scriptTitle.textContent = 'Lua Generator: Multi Selection (' + SELECTED_INSTS.length + ' items)';
    scriptArea.value = generateLuaForInstance(SELECTED_INSTS);
    updateGuideTree(null);
  }
}

function importAllToLua() {
  var roots = INST_LIST.filter(function(i){ return !INST_MAP[i.parentId]; });
  var scriptSec = document.getElementById('scriptSection');
  var scriptArea = document.getElementById('scriptArea');
  var scriptTitle = document.getElementById('scriptTitle');
  var variantSelector = document.getElementById('variantSelector');

  variantSelector.style.display = 'flex';
  scriptSec.style.display = 'flex';
  scriptTitle.textContent = 'Import All Assets to Lua';
  scriptArea.value = generateLuaForInstance(roots);
  updateGuideTree(null);
}

function propHTML(p,k) {
  if(!p) return '?';
  try {
    switch(p.t){
      case 'str':
        if(k==='Source') return '<span style="color:var(--primary);font-style:italic;">(View script content in the panel below)</span>';
        return esc(String(p.v||'').substring(0,200));
      case 'bool': return p.v?'<span style="color:var(--success)">true</span>':'<span style="color:var(--danger)">false</span>';
      case 'num':  return fn(p.v);
      case 'col3':
        var r8=Math.round((p.v.r||0)*255),g8=Math.round((p.v.g||0)*255),b8=Math.round((p.v.b||0)*255);
        var hex='#'+[r8,g8,b8].map(function(n){return n.toString(16).padStart(2,'0');}).join('');
        return '<span style="display:inline-block;width:12px;height:12px;background:'+hex+';border:1px solid var(--border-color);vertical-align:middle;margin-right:6px;border-radius:2px"></span>'+r8+', '+g8+', '+b8;
      case 'v3':   return fn(p.v.x)+', '+fn(p.v.y)+', '+fn(p.v.z);
      case 'v2':   return fn(p.v.x)+', '+fn(p.v.y);
      case 'cf':   return 'CFrame pos('+fn(p.v.x)+', '+fn(p.v.y)+', '+fn(p.v.z)+')';
      case 'udim2':return 'UDim2('+fn(p.v.xs)+', '+p.v.xo+', '+fn(p.v.ys)+', '+p.v.yo+')';
      case 'udim': return 'UDim('+fn(p.v.s)+', '+p.v.o+')';
      case 'enum': return 'Enum ('+p.v+')';
      case 'ref':  var t=INST_MAP[p.v]; return t?esc(t.name)+' ['+esc(t.cls)+']':'ref='+p.v;
      case 'bc':   return 'BrickColor('+p.v+')';
      case 'font': return esc(p.v);
      case 'seq':  return '<pre style="margin:0;font-size:10px;white-space:pre-wrap">'+esc(p.v)+'</pre>';
      case 'id':   return p.v;
      case 'nil':  return '<span style="color:var(--text-muted)">nil</span>';
      default:     return esc(String(p.v||'').substring(0,200));
    }
  } catch(ex) {
    return '(error)';
  }
}

function copyOut(){
  var ta=document.getElementById('scriptArea'); 
  ta.select(); 
  document.execCommand('copy');
  setStatus('Code successfully copied to clipboard.');
}

function downloadOut(){
  var text=document.getElementById('scriptArea').value;
  var fileName = SELECTED_INSTS.length === 1 ? SELECTED_INSTS[0].name : (SELECTED_INSTS.length > 1 ? 'multi_selection' : 'all_assets');
  var a=document.createElement('a');
  a.href='data:text/plain;charset=utf-8,'+encodeURIComponent(text);
  a.download=fileName+'.lua'; 
  a.click();
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function fn(n){
  if(!isFinite(n)) return '0';
  var r=Math.round(n);
  if(Math.abs(n-r)<0.000001) return String(r);
  return parseFloat(n.toFixed(6)).toString();
}
