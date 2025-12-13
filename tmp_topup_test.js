(async ()=>{
  require('dotenv').config();
  const fetch = global.fetch || (await import('node-fetch')).default;
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoxLCJ1c2VySWQiOiJDRTIzQjAwNSIsInJvbGUiOiJDb3JlIn0sImlhdCI6MTc2MTMyODY4NiwiZXhwIjoxNzYxMzMyMjg2fQ.iF_74UbA5cgmBKBOl3QyUwgw5x4lcOIvHFiiqQ9wIrE';
  try{
    const res = await fetch('http://localhost:5000/api/wallet/topup',{
      method:'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ amount: 5 })
    });
    const text = await res.text();
    console.log('STATUS', res.status);
    console.log(text);
  }catch(err){ console.error('REQUEST ERROR', err.stack || err); }
})();
