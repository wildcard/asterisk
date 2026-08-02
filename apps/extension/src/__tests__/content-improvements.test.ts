import { describe, it, expect } from 'vitest';
import { buildRadioGroupFieldNode, findRadioGroupLabel } from '../content-improvements';

/**
 * Radio-button group capture.
 *
 * jsdom does not perform real layout, so `getBoundingClientRect()` returns
 * an all-zero rect for every element by default - and `isFieldVisible()`
 * (which `buildRadioGroupFieldNode` filters through) treats a zero-size
 * rect as hidden. Mock a plausible non-zero rect on elements this test
 * wants treated as visible, matching how a real, rendered radio button
 * would report its size.
 */
function makeVisible(el: HTMLElement): void {
  el.getBoundingClientRect = () =>
    ({ width: 20, height: 20, top: 100, left: 100, right: 120, bottom: 120, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
}

/** Build a single radio <input>, mounted in the document (required for
 * `.closest('fieldset')` and `label[for]` lookups to work), visible by
 * default. */
function makeRadio(opts: { name: string; value: string; id?: string; required?: boolean }): HTMLInputElement {
  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = opts.name;
  radio.value = opts.value;
  if (opts.id) radio.id = opts.id;
  if (opts.required) radio.required = true;
  makeVisible(radio);
  return radio;
}

describe('findRadioGroupLabel', () => {
  it('returns the <legend> text when radios are inside a <fieldset>', () => {
    document.body.innerHTML = '';
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Have you previously been denied a visa?';
    fieldset.appendChild(legend);

    const yes = makeRadio({ name: 'q1', value: 'Y' });
    const no = makeRadio({ name: 'q1', value: 'N' });
    fieldset.append(yes, no);
    document.body.appendChild(fieldset);

    expect(findRadioGroupLabel([yes, no])).toBe('Have you previously been denied a visa?');
  });

  it('returns null when there is no fieldset/legend (caller must fall back explicitly)', () => {
    document.body.innerHTML = '';
    const yes = makeRadio({ name: 'q1', value: 'Y' });
    const no = makeRadio({ name: 'q1', value: 'N' });
    document.body.append(yes, no);

    expect(findRadioGroupLabel([yes, no])).toBeNull();
  });

  it('returns null for an empty group rather than throwing', () => {
    expect(findRadioGroupLabel([])).toBeNull();
  });
});

describe('buildRadioGroupFieldNode', () => {
  it('merges a Yes/No radio group into one field with two options', () => {
    document.body.innerHTML = '';
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Are you currently employed?';
    fieldset.appendChild(legend);

    const yes = makeRadio({ name: 'employed', value: 'Y', id: 'employed_yes' });
    const yesLabel = document.createElement('label');
    yesLabel.setAttribute('for', 'employed_yes');
    yesLabel.textContent = 'Yes';

    const no = makeRadio({ name: 'employed', value: 'N', id: 'employed_no' });
    const noLabel = document.createElement('label');
    noLabel.setAttribute('for', 'employed_no');
    noLabel.textContent = 'No';

    fieldset.append(yes, yesLabel, no, noLabel);
    document.body.appendChild(fieldset);

    const field = buildRadioGroupFieldNode([yes, no]);

    expect(field).not.toBeNull();
    expect(field?.type).toBe('radio');
    expect(field?.name).toBe('employed');
    expect(field?.id).toBe('radio-group-employed');
    expect(field?.label).toBe('Are you currently employed?');
    expect(field?.options).toEqual([
      { value: 'Y', label: 'Yes' },
      { value: 'N', label: 'No' },
    ]);
  });

  it('falls back to joining option labels when no fieldset/legend exists', () => {
    document.body.innerHTML = '';
    const yes = makeRadio({ name: 'q2', value: 'true', id: 'q2_yes' });
    const yesLabel = document.createElement('label');
    yesLabel.setAttribute('for', 'q2_yes');
    yesLabel.textContent = 'Yes';

    const no = makeRadio({ name: 'q2', value: 'false', id: 'q2_no' });
    const noLabel = document.createElement('label');
    noLabel.setAttribute('for', 'q2_no');
    noLabel.textContent = 'No';

    document.body.append(yes, yesLabel, no, noLabel);

    const field = buildRadioGroupFieldNode([yes, no]);
    expect(field?.label).toBe('Yes / No');
  });

  it('falls back to the raw value as an option label when no label element exists', () => {
    document.body.innerHTML = '';
    const a = makeRadio({ name: 'q3', value: 'optA' });
    const b = makeRadio({ name: 'q3', value: 'optB' });
    document.body.append(a, b);

    const field = buildRadioGroupFieldNode([a, b]);
    expect(field?.options).toEqual([
      { value: 'optA', label: 'optA' },
      { value: 'optB', label: 'optB' },
    ]);
  });

  it('is required if ANY radio in the group is required (the group as a whole must be answered)', () => {
    document.body.innerHTML = '';
    const yes = makeRadio({ name: 'q4', value: 'Y', required: true });
    const no = makeRadio({ name: 'q4', value: 'N' }); // not individually marked required
    document.body.append(yes, no);

    const field = buildRadioGroupFieldNode([yes, no]);
    expect(field?.required).toBe(true);
  });

  it('is not required when no radio in the group is required', () => {
    document.body.innerHTML = '';
    const yes = makeRadio({ name: 'q5', value: 'Y' });
    const no = makeRadio({ name: 'q5', value: 'N' });
    document.body.append(yes, no);

    const field = buildRadioGroupFieldNode([yes, no]);
    expect(field?.required).toBe(false);
  });

  it('excludes hidden radios from the options but keeps visible ones', () => {
    document.body.innerHTML = '';
    const visible1 = makeRadio({ name: 'q6', value: 'A' });
    const hidden = makeRadio({ name: 'q6', value: 'B' });
    hidden.style.display = 'none'; // isFieldVisible checks computed display first
    const visible2 = makeRadio({ name: 'q6', value: 'C' });
    document.body.append(visible1, hidden, visible2);

    const field = buildRadioGroupFieldNode([visible1, hidden, visible2]);
    expect(field?.options?.map((o) => o.value)).toEqual(['A', 'C']);
  });

  it('returns null when every radio in the group is hidden', () => {
    document.body.innerHTML = '';
    const a = makeRadio({ name: 'q7', value: 'A' });
    const b = makeRadio({ name: 'q7', value: 'B' });
    a.style.display = 'none';
    b.style.display = 'none';
    document.body.append(a, b);

    expect(buildRadioGroupFieldNode([a, b])).toBeNull();
  });

  it('returns null for an empty radios array rather than throwing', () => {
    expect(buildRadioGroupFieldNode([])).toBeNull();
  });
});
