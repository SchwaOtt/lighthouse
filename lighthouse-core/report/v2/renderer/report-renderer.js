/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

/**
 * @fileoverview The entry point for rendering the Lighthouse report based on the JSON output.
 *    This file is injected into the report HTML along with the JSON report.
 *
 * Dummy text for ensuring report robustness: </script> pre$`post %%LIGHTHOUSE_JSON%%
 */

/* globals self, Util, DetailsRenderer, CategoryRenderer, PerformanceCategoryRenderer */

class ReportRenderer {
  /**
   * @param {!DOM} dom
   */
  constructor(dom) {
    /** @private {!DOM} */
    this._dom = dom;
    /** @private {!Document|!Element} */
    this._templateContext = this._dom.document();
  }

  /**
   * @param {!ReportRenderer.ReportJSON} report
   * @param {!Element} container Parent element to render the report into.
   */
  renderReport(report, container) {
    // If any mutations happen to the report within the renderers, we want the original object untouched
    const clone = /** @type {!ReportRenderer.ReportJSON} */ (JSON.parse(JSON.stringify(report)));

    if (!Array.isArray(clone.reportCategories)) throw new Error('No reportCategories provided.');
    ReportRenderer.smooshAuditResultsIntoCategories(clone.audits, clone.reportCategories);

    container.textContent = ''; // Remove previous report.
    const element = container.appendChild(this._renderReport(clone));
    return /** @type {!Element} **/ (element);
  }

  /**
   * Define a custom element for <templates> to be extracted from. For example:
   *     this.setTemplateContext(new DOMParser().parseFromString(htmlStr, 'text/html'))
   * @param {!Document|!Element} context
   */
  setTemplateContext(context) {
    this._templateContext = context;
  }

  /**
   * @param {!ReportRenderer.ReportJSON} report
   * @return {!DocumentFragment}
   */
  _renderReportHeader(report) {
    const header = this._dom.cloneTemplate('#tmpl-lh-heading', this._templateContext);
    this._dom.find('.lh-config__timestamp', header).textContent =
        Util.formatDateTime(report.fetchedAt);
    const url = this._dom.find('.lh-metadata__url', header);
    url.href = report.url;
    url.textContent = report.url;

    this._dom.find('.lh-env__item__ua', header).textContent = report.userAgent;

    const env = this._dom.find('.lh-env__items', header);
    report.runtimeConfig.environment.forEach(runtime => {
      const item = this._dom.cloneTemplate('#tmpl-lh-env__items', env);
      this._dom.find('.lh-env__name', item).textContent = runtime.name;
      this._dom.find('.lh-env__description', item).textContent = runtime.description;
      env.appendChild(item);
    });

    return header;
  }

  /**
   * @param {!ReportRenderer.ReportJSON} report
   * @return {!DocumentFragment}
   */
  _renderReportFooter(report) {
    const footer = this._dom.cloneTemplate('#tmpl-lh-footer', this._templateContext);
    this._dom.find('.lh-footer__version', footer).textContent = report.lighthouseVersion;
    this._dom.find('.lh-footer__timestamp', footer).textContent =
        Util.formatDateTime(report.fetchedAt);
    return footer;
  }

  /**
   * @param {!ReportRenderer.ReportJSON} report
   * @return {!DocumentFragment}
   */
  _renderReportNav(report) {
    const leftNav = this._dom.cloneTemplate('#tmpl-lh-leftnav', this._templateContext);

    this._dom.find('.leftnav__header__version', leftNav).textContent =
        `Version: ${report.lighthouseVersion}`;

    const nav = this._dom.find('.lh-leftnav', leftNav);
    for (const category of report.reportCategories) {
      const itemsTmpl = this._dom.cloneTemplate('#tmpl-lh-leftnav__items', leftNav);

      const navItem = this._dom.find('.lh-leftnav__item', itemsTmpl);
      navItem.href = `#${category.id}`;

      this._dom.find('.leftnav-item__category', navItem).textContent = category.name;
      const score = this._dom.find('.leftnav-item__score', navItem);
      score.classList.add(`lh-score__value--${Util.calculateRating(category.score)}`);
      score.textContent = Math.round(100 * category.score);
      nav.appendChild(navItem);
    }
    return leftNav;
  }

  /**
   * Returns a div with a list of top-level warnings, or an empty div if no warnings.
   * @param {!ReportRenderer.ReportJSON} report
   * @return {!Node}
   */
  _renderReportWarnings(report) {
    if (!report.runWarnings || report.runWarnings.length === 0) {
      return this._dom.createElement('div');
    }

    const container = this._dom.cloneTemplate('#tmpl-lh-run-warnings', this._templateContext);
    const warnings = this._dom.find('ul', container);
    for (const warningString of report.runWarnings) {
      const warning = warnings.appendChild(this._dom.createElement('li'));
      warning.textContent = warningString;
    }

    return container;
  }

  /**
   * @param {!ReportRenderer.ReportJSON} report
   * @return {!Element}
   */
  _renderReport(report) {
    const container = this._dom.createElement('div', 'lh-container');
    container.appendChild(this._renderReportHeader(report)); // sticky header goes at the top.
    container.appendChild(this._renderReportNav(report));
    const reportSection = container.appendChild(this._dom.createElement('div', 'lh-report'));

    reportSection.appendChild(this._renderReportWarnings(report));

    let scoreHeader;
    const isSoloCategory = report.reportCategories.length === 1;
    if (!isSoloCategory) {
      scoreHeader = reportSection.appendChild(this._dom.createElement('div', 'lh-scores-header'));
    }

    const detailsRenderer = new DetailsRenderer(this._dom);
    const categoryRenderer = new CategoryRenderer(this._dom, detailsRenderer);
    categoryRenderer.setTemplateContext(this._templateContext);
    const perfCategoryRenderer = new PerformanceCategoryRenderer(this._dom, detailsRenderer);
    perfCategoryRenderer.setTemplateContext(this._templateContext);

    const categories = reportSection.appendChild(this._dom.createElement('div', 'lh-categories'));

    for (const category of report.reportCategories) {
      if (scoreHeader) {
        scoreHeader.appendChild(categoryRenderer.renderScoreGauge(category));
      }

      let renderer = categoryRenderer;
      if (category.id === 'performance') {
        renderer = perfCategoryRenderer;
      }
      categories.appendChild(renderer.render(category, report.reportGroups));
    }

    reportSection.appendChild(this._renderReportFooter(report));

    return container;
  }

  /**
   * Place the AuditResult into the auditDfn (which has just weight & group)
   * @param {!Object<string, !ReportRenderer.AuditResultJSON>} audits
   * @param {!Array<!ReportRenderer.CategoryJSON>} reportCategories
   */
  static smooshAuditResultsIntoCategories(audits, reportCategories) {
    for (const category of reportCategories) {
      category.audits.forEach(auditMeta => {
        const result = audits[auditMeta.id];
        auditMeta.result = result;
      });
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportRenderer;
} else {
  self.ReportRenderer = ReportRenderer;
}

/**
 * @typedef {{
 *     rawValue: (number|boolean|undefined),
 *     description: string,
 *     informative: (boolean|undefined),
 *     manual: (boolean|undefined),
 *     notApplicable: (boolean|undefined),
 *     debugString: (string|undefined),
 *     displayValue: string,
 *     helpText: string,
 *     scoreDisplayMode: string,
 *     extendedInfo: Object,
 *     error: boolean,
 *     score: number,
 *     details: (!DetailsRenderer.DetailsJSON|undefined),
 * }}
 */
ReportRenderer.AuditResultJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     id: string,
 *     score: number,
 *     weight: number,
 *     group: (string|undefined),
 *     result: (ReportRenderer.AuditResultJSON|undefined)
 * }}
 */
ReportRenderer.AuditJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     name: string,
 *     id: string,
 *     score: number,
 *     description: string,
 *     audits: !Array<!ReportRenderer.AuditJSON>
 * }}
 */
ReportRenderer.CategoryJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     title: string,
 *     description: (string|undefined),
 * }}
 */
ReportRenderer.GroupJSON; // eslint-disable-line no-unused-expressions

/**
 * @typedef {{
 *     lighthouseVersion: string,
 *     userAgent: string,
 *     fetchedAt: string,
 *     generatedTime: string,
 *     timing: {total: number},
 *     initialUrl: string,
 *     url: string,
 *     runWarnings: (!Array<string>|undefined),
 *     artifacts: {traces: {defaultPass: {traceEvents: !Array}}},
 *     audits: !Object<string, !ReportRenderer.AuditResultJSON>,
 *     reportCategories: !Array<!ReportRenderer.CategoryJSON>,
 *     reportGroups: !Object<string, !ReportRenderer.GroupJSON>,
 *     runtimeConfig: {
 *       blockedUrlPatterns: !Array<string>,
 *       extraHeaders: !Object<string, string>,
 *       environment: !Array<{description: string, enabled: boolean, name: string}>
 *     }
 * }}
 */
ReportRenderer.ReportJSON; // eslint-disable-line no-unused-expressions
