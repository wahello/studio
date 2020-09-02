import chunk from 'lodash/chunk';
import merge from 'lodash/merge';

import { LicensesList } from 'shared/leUtils/Licenses';

/**
 * Insert an item into an array before another item.
 * @param {Array} arr
 * @param {Number} idx An index of an item before which
 *                     a new item will be inserted.
 * @param {*} item A new item to be inserted into an array.
 */
export function insertBefore(arr, idx, item) {
  const newArr = JSON.parse(JSON.stringify(arr));
  const insertAt = Math.max(0, idx);
  newArr.splice(insertAt, 0, item);

  return newArr;
}

/**
 * Insert an item into an array after another item.
 * @param {Array} arr
 * @param {Number} idx An index of an item after which
 *                     a new item will be inserted.
 * @param {*} item A new item to be inserted into an array.
 */
export function insertAfter(arr, idx, item) {
  const newArr = JSON.parse(JSON.stringify(arr));
  const insertAt = Math.min(arr.length, idx + 1);
  newArr.splice(insertAt, 0, item);

  return newArr;
}

/**
 * Swap two elements of an array
 * @param {Array} arr
 * @param {Number} idx1
 * @param {Number} idx2
 */
export function swapElements(arr, idx1, idx2) {
  const newArr = JSON.parse(JSON.stringify(arr));
  [newArr[idx1], newArr[idx2]] = [newArr[idx2], newArr[idx1]];

  return newArr;
}

/**
 * Chunks an array of `things`, calling `callback` with `chunkSize` amount of items,
 * expecting callback to return `Promise` that when resolved will allow next chunk to be processed.
 * This then returns a promise that resolves when all promises returned from `callback(chunk)`
 * are resolved.
 *
 * @param {mixed[]} things -- `things` => `chunk`
 * @param {number} chunkSize
 * @param {Function<Promise>} callback
 * @return {Promise<mixed[]>}
 */
export function promiseChunk(things, chunkSize, callback) {
  if (!things.length) {
    return Promise.resolve([]);
  }

  return chunk(things, chunkSize).reduce((promise, thingChunk) => {
    return promise.then(results =>
      callback(thingChunk).then(chunkResults => results.concat(chunkResults))
    );
  }, Promise.resolve([]));
}

function insertText(doc, fontList, node, x, y, maxWidth, scale, isRtl = false) {
  const style = window.getComputedStyle(node, null);
  const font = fontList[style.getPropertyValue('font-family')]
    ? style.getPropertyValue('font-family')
    : Object.keys(fontList)[0];
  const fontSize = parseInt(style.getPropertyValue('font-size')) * scale;
  const fontStyle = style.getPropertyValue('font-style');
  let align = style.getPropertyValue('text-align');
  let fontWeight = style.getPropertyValue('font-weight');

  if (!isNaN(Number(fontWeight))) {
    if (Number(fontWeight) > 400) {
      fontWeight = 'bold';
    } else {
      fontWeight = 'normal';
    }
  } else if (fontWeight === 'bolder') {
    fontWeight = 'bold';
  } else if (fontWeight === 'lighter') {
    fontWeight = 'normal';
  }

  let computedFontStyle;

  if (fontStyle === 'normal') {
    if (fontWeight === 'normal') {
      computedFontStyle = 'normal';
    } else {
      computedFontStyle = 'bold';
    }
  } else {
    if (fontWeight === 'normal') {
      computedFontStyle = 'italic';
    } else {
      computedFontStyle = 'bolditalic';
    }
  }

  if (align === 'start') {
    align = isRtl ? 'right' : 'left';
  } else if (align === 'end') {
    align = isRtl ? 'left' : 'right';
  }

  doc.setFont(font, computedFontStyle);
  doc.setFontSize(fontSize);
  doc.text(node.innerText.trim(), scale * x, scale * y, {
    baseline: 'top',
    maxWidth: maxWidth * scale,
    align,
  });
}

function getContainedSize(img) {
  const ratio = img.naturalWidth / img.naturalHeight;
  let width = img.height * ratio;
  let height = img.height;
  if (width > img.width) {
    width = img.width;
    height = img.width / ratio;
  }
  return [width, height];
}

export function fitToScale(boundingRect, scale = 1) {
  // JSPDF doesn't seem to handle coordinates and sizing
  // properly in pixels, so we use the dimensions in points here
  // and scale from our pixel measurements to points.
  // (the other alternative is that rtibbles is completely misunderstanding
  // what the standard DPI they are using is, and hence why it's not working)
  const pageWidth = 612;
  const pageHeight = 792;
  if (pageHeight / scale < boundingRect.height) {
    scale = pageHeight / boundingRect.height;
  }
  if (pageWidth / scale < boundingRect.width) {
    scale = pageWidth / boundingRect.width;
  }
  return scale;
}

export async function generatePdf(
  htmlRef,
  doc = null,
  { save = false, scale = null, filename } = {}
) {
  return require.ensure(['jspdf', 'html2canvas'], require => {
    const format = 'letter';
    const jsPDF = require('jspdf');
    const html2canvas = require('html2canvas');
    const boundingRect = htmlRef.getBoundingClientRect();
    if (!doc) {
      doc = new jsPDF('p', 'pt', format);
    } else {
      doc.addPage(format);
    }
    if (!scale) {
      scale = fitToScale(boundingRect);
    }

    const fontList = doc.getFontList();
    const promises = [];
    function recurseNodes(node) {
      if (node.children.length && !node.attributes['capture-as-image']) {
        [].map.call(node.children, recurseNodes);
      }
      const nodeRect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node, null);
      const paddingLeft = parseInt(style.getPropertyValue('padding-left'));
      const marginLeft = parseInt(style.getPropertyValue('margin-left'));
      const borderLeft = parseInt(style.getPropertyValue('border-left'));
      const paddingTop = parseInt(style.getPropertyValue('padding-top'));
      const marginTop = parseInt(style.getPropertyValue('margin-top'));
      const borderTop = parseInt(style.getPropertyValue('border-top'));
      const x = nodeRect.left - boundingRect.left + paddingLeft + marginLeft + borderLeft;
      const y = nodeRect.top - boundingRect.top + paddingTop + marginTop + borderTop;
      const width = nodeRect.width;
      const height = nodeRect.height;

      // jsPDF currently has issues rendering non-unicode text, so render these as images
      const isText = !node.childElementCount && node.innerText;

      // eslint-disable-next-line no-control-regex
      const isNonUnicode = isText && /[^\u0000-\u00ff]/.test(node.innerText);

      if (node.attributes['capture-as-image']) {
        promises.push(
          html2canvas(node).then(canvas => {
            doc.addImage(
              canvas.toDataURL(),
              'PNG',
              scale * (x - width / 2),
              scale * y,
              scale * width,
              scale * height
            );
          })
        );
      } else if (isNonUnicode) {
        promises.push(
          html2canvas(node).then(canvas => {
            doc.addImage(
              canvas.toDataURL(),
              'PNG',
              scale * (x - 8), // Account for padding
              scale * y,
              scale * width,
              scale * height
            );
          })
        );
      } else if (isText) {
        insertText(doc, fontList, node, x, y, width, scale);
      } else if (node.tagName === 'IMG') {
        const filename = node.src.split('?')[0];
        const extension = filename.split('.').slice(-1)[0];
        if (extension.toLowerCase() === 'svg') {
          promises.push(
            new Promise(resolve => {
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const context = canvas.getContext('2d');
              context.fillStyle = style.getPropertyValue('background-color');
              context.fillRect(0, 0, canvas.width, canvas.height);
              const img = new Image();
              img.onload = function() {
                context.drawImage(img, 0, 0);
                doc.addImage(
                  canvas.toDataURL(),
                  'PNG',
                  scale * x,
                  scale * y,
                  scale * width,
                  scale * height
                );
                resolve();
              };
              img.setAttribute('crossorigin', 'anonymous');
              img.src = node.src;
            })
          );
        } else {
          const [containedWidth, containedHeight] = getContainedSize(node);
          doc.addImage(
            node,
            undefined,
            scale * x,
            scale * y,
            scale * (containedWidth || width),
            scale * (containedHeight || height)
          );
        }
      }
    }
    recurseNodes(htmlRef);
    return Promise.all(promises).then(() => {
      if (save) {
        return doc.save(filename, { returnPromise: true });
      }
      return doc;
    });
  });
}

/**
 * Given an ID or string constant identifier, return the license info

 * @param {Number | String} key A license identifier
 */
export function findLicense(key, defaultValue = {}) {
  let license = LicensesList.find(
    license => license.license_name === key || license.id === parseInt(key, 10)
  );

  return license || defaultValue;
}

/**
 * Creates a function that can be used to request an animation frame as well as cancel it easily.
 *
 * @param {Function} callback
 * @return {Function}
 */
export function animationThrottle(callback) {
  let animationFrameId = null;
  let lastCallback = () => {};

  const throttled = function(...args) {
    lastCallback = () => {
      callback(...args);
      animationFrameId = null;
    };

    if (animationFrameId) {
      return;
    }

    animationFrameId = requestAnimationFrame(lastCallback);
  };

  /**
   * Cancels any pending frame request and immediately executes the function with the last args
   */
  throttled.flush = function() {
    throttled.cancel();
    lastCallback();
  };

  /**
   * Cancels any pending frame request
   */
  throttled.cancel = function() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  return throttled;
}

/**
 * Takes a scoped slot function (or any function that returns a VNode), and extends the
 * components options with those passed in.
 *
 * @param {function<VNode>} scopedSlotFunction
 * @param {Object} [options]
 * @returns {null|VNode}
 */
export function extendAndRender(scopedSlotFunction, options = {}) {
  let element = null;

  if (this.$scopedSlots.default) {
    element = scopedSlotFunction();
  } else {
    // Should have scoped slot
    return null;
  }

  if (Array.isArray(element)) {
    if (element.length === 1) {
      element = element[0];
    } else {
      // Must only have one element returned from the slot
      element = null;
    }
  }

  if (element) {
    element.data = element.data || {};
    merge(element.data, options);
  }

  // console.log(element);
  return element;
}
