// nocks/github.test.ts
import nock from 'nock';
// import { MockAgent, setGlobalDispatcher } from 'undici';
//
// const agent = new MockAgent();
// agent.disableNetConnect();
// setGlobalDispatcher(agent);
// const client = agent.get('https://api.github.com');
// client.intercept({ method: 'GET', path: '/repos/checkdigit/test/issues/10/comments' }).reply(200, () => {
//   console.log('here');
// });
//
// client.intercept({ method: 'POST', path: '/repos/checkdigit/test/issues/10/comments' }).reply(200, {} /* ? */);
//
// export default agent;

export default function (): void {
  nock('https://api.github.com/').persist().get('/repos/checkdigit/nocomments/issues/10/comments').reply(200);
  nock('https://api.github.com/').persist().post('/repos/checkdigit/nocomments/issues/10/comments').reply(200);

  nock('https://api.github.com/')
    .persist()
    .get('/repos/checkdigit/comments/issues/10/comments')
    .reply(200, () => [
      {
        id: 1,
        body: 'Beta Published - Install Command: npm install @checktest/canberemoved',
      },
      {
        id: 2,
        body: 'normal comment',
      },
      {
        id: 3,
        body: 'Beta Published - Install Command: npm install @checktest/canberemoved',
      },
    ]);

  // allow delete operations to the two comments that should be deleted
  nock('https://api.github.com/').persist().delete('/repos/checkdigit/comments/issues/comments/1').reply(200);
  nock('https://api.github.com/').persist().delete('/repos/checkdigit/comments/issues/comments/3').reply(200);

  nock('https://api.github.com/').persist().post('/repos/checkdigit/comments/issues/10/comments').reply(200);
}
