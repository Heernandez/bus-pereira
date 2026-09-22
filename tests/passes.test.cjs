const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const crypto=require('node:crypto');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const protocol=require('../src/services/passProtocol.ts');
const verify=(key,message,signature)=>crypto.verify('sha256',Buffer.from(message),{key:crypto.createPublicKey({key:Buffer.from(key,'base64url'),format:'der',type:'spki'}),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'));
test('firma móvil P-256 compatible con verificador backend, ligada a instalación',()=>{
 const secret=crypto.randomBytes(32),publicKey=protocol.devicePublicKey(secret),id=crypto.randomUUID();
 const message=protocol.registrationMessage(id,publicKey),sig=protocol.signDevice(message,secret);
 assert.equal(verify(publicKey,message,sig),true);assert.equal(verify(publicKey,protocol.registrationMessage(crypto.randomUUID(),publicKey),sig),false);
 const purchase=protocol.purchaseMessage(id,'7_days',crypto.randomUUID());assert.equal(verify(publicKey,purchase,protocol.signDevice(purchase,secret)),true);
});
test('QR móvil contiene instante y nonce frescos y rechaza alteraciones',()=>{
 const secret=crypto.randomBytes(32),publicKey=protocol.devicePublicKey(secret),passId=crypto.randomUUID(),id=crypto.randomUUID(),time=Date.now();
 const first=protocol.createPassQr(passId,id,time,crypto.randomUUID(),secret),next=protocol.createPassQr(passId,id,time+15000,crypto.randomUUID(),secret);
 assert.notEqual(first,next);const [version,payload,sig]=first.split('.');const data=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(data.installationId,id);assert.equal(data.passId,passId);assert.equal(data.issuedAt,time);
 assert.equal(verify(publicKey,`${version}.${payload}`,sig),true);
 data.issuedAt+=60000;assert.equal(verify(publicKey,`${version}.${Buffer.from(JSON.stringify(data)).toString('base64url')}`,sig),false);
});

test('wallet persiste solicitud antes del envío, recupera retry y separa caché por usuario',async()=>{
 const Module=require('node:module');const secure=new Map(),plain=new Map();const id=crypto.randomUUID();
 const secureApi={WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,getItemAsync:async k=>secure.get(k)??null,setItemAsync:async(k,v)=>{secure.set(k,v);},deleteItemAsync:async k=>{secure.delete(k);}};
 const storage={getItem:async k=>plain.get(k)??null,setItem:async(k,v)=>{plain.set(k,v);}};
 const load=()=>{
  const filename=path.resolve(__dirname,'../src/services/passWallet.ts'),m=new Module(filename,module);m.filename=filename;m.paths=module.paths;
  m.require=specifier=>({
   'expo-secure-store':secureApi,'@react-native-async-storage/async-storage':storage,
   'expo-crypto':{getRandomBytes:n=>new Uint8Array(crypto.randomBytes(n)),randomUUID:crypto.randomUUID},
   '@react-native-google-signin/google-signin':{GoogleSignin:{getTokens:async()=>({idToken:'test'})}},
   './installation':{getInstallationId:async()=>id},'./transit':{API_URL:'https://test.example/api/v1'},'./passProtocol':protocol,
  })[specifier]??require(specifier);
  m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);return m.exports;
 };
 let drop=true,requestId;const original=global.fetch;const pass={id:crypto.randomUUID(),installationId:id,productId:'7_days',name:'Pase',description:'7 días',price:42000,currency:'COP',purchasedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),remainingUses:null,status:'active'};
 global.fetch=async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('/me/installations'))return {ok:true,json:async()=>({data:{installationId:id}})};
  assert.ok([...secure.values()].some(v=>v===body.requestId || (v.startsWith('{')&&JSON.parse(v).requestId===body.requestId)),'requestId persisted before network');
  if(requestId)assert.equal(body.requestId,requestId);else requestId=body.requestId;
  if(drop){drop=false;throw Error('response lost');}
  return {ok:true,json:async()=>({data:{pass}})};
 };
 try{
  await assert.rejects(load().buyPass('owner-a','7_days'));
  const wallet=load();assert.equal((await wallet.buyPass('owner-a','7_days')).id,pass.id);
  assert.equal((await load().loadPasses('owner-a'))[0].id,pass.id);
  assert.deepEqual(await wallet.loadPasses('owner-b'),[]);
  assert.ok([...plain.values()].every(v=>!v.includes('42000')&&!v.includes('secret')));
  assert.ok([...secure.keys()].some(k=>k.endsWith('.secret')));
 }finally{global.fetch=original;}
});

test('firma de pago incluye el medio elegido y activación tiene dominio separado',()=>{
 const secret=crypto.randomBytes(32),publicKey=protocol.devicePublicKey(secret),id=crypto.randomUUID(),request=crypto.randomUUID();
 const message=protocol.purchaseMessage(id,'7_days',request,'pse');const signature=protocol.signDevice(message,secret);
 assert.equal(verify(publicKey,message,signature),true);
 assert.equal(verify(publicKey,protocol.purchaseMessage(id,'7_days',request,'card'),signature),false);
 assert.equal(verify(publicKey,protocol.activationMessage(request,id),signature),false);
 const activation=protocol.activationMessage(request,id);assert.equal(verify(publicKey,activation,protocol.signDevice(activation,secret)),true);
});
