import stylelint from 'stylelint';
import isKeyframeSelector from 'stylelint/lib/utils/isKeyframeSelector';
import isStandardSyntaxRule from 'stylelint/lib/utils/isStandardSyntaxRule';
import isStandardSyntaxSelector from 'stylelint/lib/utils/isStandardSyntaxSelector';
import parseSelector from 'stylelint/lib/utils/parseSelector';
import resolveNestedSelector from 'postcss-resolve-nested-selector';
import { isBoolean, isRegExp, isString } from 'stylelint/lib/utils/validateTypes';
import { isLessMixin, namespace } from '../../utils';

export const ruleName = namespace('selector-class-pattern');

export const messages = stylelint.utils.ruleMessages(ruleName, {
	expected: (selector, pattern) => `Expected "${selector}" to match pattern "${pattern}"`,
});

/** @type {import('stylelint').Rule<string | RegExp, { resolveNestedSelector: boolean }>} */
export default (primary, secondaryOptions) => {
	return (root, result) => {
		const validOptions = stylelint.utils.validateOptions(
			result,
			ruleName,
			{
				actual: primary,
				possible: [isRegExp, isString],
			},
			{
				actual: secondaryOptions,
				possible: {
					resolveNestedSelectors: [isBoolean],
				},
				optional: true,
			},
		);

		if (!validOptions) {
			return;
		}

		const shouldResolveNestedSelectors = Boolean(
			secondaryOptions && secondaryOptions.resolveNestedSelectors,
		);

		const normalizedPattern = isString(primary) ? new RegExp(primary) : primary;

		root.walkRules((ruleNode) => {
			const { selector, selectors } = ruleNode;

			if (!isStandardSyntaxRule(ruleNode)) {
				return;
			}

			if (selectors.some((s) => isKeyframeSelector(s))) {
				return;
			}

			// Only bother resolving selectors that have an interpolating &
			if (shouldResolveNestedSelectors && hasInterpolatingAmpersand(selector)) {
				for (const nestedSelector of resolveNestedSelector(selector, ruleNode)) {
					if (!isStandardSyntaxSelector(nestedSelector)) {
						continue;
					}

					parseSelector(nestedSelector, result, ruleNode, (s) => checkSelector(s, ruleNode));
				}
			} else {
				parseSelector(selector, result, ruleNode, (s) => checkSelector(s, ruleNode));
			}
		});

		/**
		 * @param {import('postcss-selector-parser').Root} selectorNode
		 * @param {import('postcss').Rule} ruleNode
		 */
		function checkSelector(selectorNode, ruleNode) {
			selectorNode.walkClasses((classNode) => {
				const { value, sourceIndex: index } = classNode;

				if (normalizedPattern.test(value)) {
					return;
				}

				if (isLessMixin(value)) {
					return;
				}

				const selector = String(classNode);

				// TODO: `selector` may be resolved. So, getting its raw value may be pretty hard.
				//       It means `endIndex` may be inaccurate (though non-standard selectors).
				//
				//       For example, given ".abc { &_x {} }".
				//       Then, an expected raw `selector` is "&_x",
				//       but, an actual `selector` is ".abc_x".
				const endIndex = index + selector.length;

				stylelint.utils.report({
					result,
					ruleName,
					message: messages.expected,
					messageArgs: [selector, primary],
					node: ruleNode,
					index,
					endIndex,
				});
			});
		}
	};
};

/**
 * An "interpolating ampersand" means an "&" used to interpolate
 * within another simple selector, rather than an "&" that
 * stands on its own as a simple selector.
 *
 * @param {string} selector
 * @returns {boolean}
 */
function hasInterpolatingAmpersand(selector) {
	for (const [i, char] of Array.from(selector).entries()) {
		if (char !== '&') {
			continue;
		}

		const prevChar = selector.charAt(i - 1);

		if (prevChar && !isCombinator(prevChar)) {
			return true;
		}

		const nextChar = selector.charAt(i + 1);

		if (nextChar && !isCombinator(nextChar)) {
			return true;
		}
	}

	return false;
}

/**
 * @param {string} x
 * @returns {boolean}
 */
function isCombinator(x) {
	return /[\s+>~]/.test(x);
}