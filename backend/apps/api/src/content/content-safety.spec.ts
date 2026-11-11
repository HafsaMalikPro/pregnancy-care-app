import { BadRequestException } from '@nestjs/common';
import { assertSafeContent, unsafeContentReason } from './content-safety.js';

describe('content safety', () => {
  it.each([
    [
      'plain markdown',
      '## Heading\n\n- Eat **folate**-rich foods\n- Weeks < twelve: rest',
    ],
    ['https link', 'See [NICE](https://www.nice.org.uk/guidance)'],
    ['relative link', 'Read [week 12](/weeks/12) and [below](#tips)'],
    ['https autolink', 'Source: <https://www.who.int/>'],
    ['prose with colons', 'Data: blood pressure and javascript: not a link'],
    ['comparison', 'a<5 and 3 > 2'],
  ])('accepts %s', (_, text) => {
    expect(unsafeContentReason(text)).toBeNull();
  });

  it.each([
    ['script tag', 'Hi <script>alert(1)</script>'],
    ['img with handler', '<img src=x onerror=alert(1)>'],
    ['iframe', '<iframe src="https://evil.test"></iframe>'],
    ['closing tag', 'text</p>'],
    ['comment', '<!-- hidden -->'],
    ['svg', '<svg onload=alert(1)>'],
    ['javascript link', '[x](javascript:alert(1))'],
    ['mixed-case scheme', '[x](JaVaScRiPt:alert(1))'],
    ['scheme split by whitespace', '[x](java\tscript:alert(1))'],
    ['scheme split by control char', '[x](java\u0000script:alert(1))'],
    ['data URL image', '![x](data:image/svg+xml;base64,PHN2Zz4=)'],
    ['vbscript', '[x](vbscript:msgbox)'],
    ['plain http', '[x](http://example.org)'],
    ['protocol-relative', '[x](//evil.test/x)'],
    ['reference definition', '[ref]: javascript:alert(1)'],
    ['numeric reference', '&#106;avascript:alert(1)'],
    ['hex reference', '&#x6A;avascript'],
    ['autolink to javascript', '<javascript:alert(1)>'],
  ])('refuses %s', (_, text) => {
    expect(unsafeContentReason(text)).not.toBeNull();
  });

  it('checks every nested string and names its path', () => {
    expect(() =>
      assertSafeContent({
        title: 'Fine',
        sections: { steps: ['ok', { tip: '<b>bold</b>' }] },
      }),
    ).toThrow(BadRequestException);
    try {
      assertSafeContent({ sections: { steps: ['ok', { tip: '<b>x</b>' }] } });
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        message: ['sections.steps.1.tip must not contain HTML'],
      });
    }
    expect(() =>
      assertSafeContent({ title: 'Fine', body: undefined }),
    ).not.toThrow();
  });
});
