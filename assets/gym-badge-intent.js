/* Keep the native accelerated product form attributable as well as direct checkout. */
(function () {
  'use strict';
  var root = document.querySelector('.gb-intent[data-gb-use-state]');
  if (!root) return;
  var form = root.querySelector('.gb-intent-payment');
  if (!form) return;
  var params = new URLSearchParams(window.location.search);
  var saved = {};
  try { saved = JSON.parse(sessionStorage.getItem('zk_gym_badge_use_state_attribution') || '{}'); } catch (_) {}
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_id', 'campaign_id', 'adset_id', 'ad_id'].forEach(function (key) {
    var value = String(params.get(key) || saved[key] || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240);
    if (!value) return;
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'properties[_zk_' + key + ']';
    input.value = value;
    form.appendChild(input);
  });
})();
