import { $, $$ } from './dom.ts';

export function initDropdown(
    toggleId: string,
    contentId: string,
): void {
    const toggle =
        $(`#${toggleId}`, document);
    const content =
        $(`#${contentId}`, document);
    if (!toggle || !content) return;

    toggle.addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            $$(
                '.dropdown-content',
                document,
            ).forEach(
                dropdown => {
                    if (
                        dropdown.id
                            !== contentId
                    )
                        dropdown
                            .classList
                            .add('hidden');
                },
            );
            content.classList.toggle(
                'hidden',
            );
        },
    );

    document.addEventListener(
        'click',
        (e) => {
            if (
                e.target instanceof Node
                && !content.contains(
                    e.target,
                )
                && !toggle.contains(
                    e.target,
                )
            ) {
                content.classList.add(
                    'hidden',
                );
            }
        },
    );
}
