// Keep the active control and, when space allows, its label/error inside its own scroll region.
export function visibleFieldScrollTop({ scrollTop, scrollHeight, viewportTop, viewportBottom, fieldTop, fieldBottom, controlTop, controlBottom }) {
    const height = viewportBottom - viewportTop;
    if (height <= 0) return scrollTop;
    const inset = Math.min(12, Math.max(0, (height - (controlBottom - controlTop)) / 2));
    const fitsField = fieldBottom - fieldTop <= height - inset * 2;
    const top = fitsField ? fieldTop : controlTop;
    const bottom = fitsField ? fieldBottom : controlBottom;
    let next = scrollTop;
    if (top < viewportTop + inset) next += top - viewportTop - inset;
    else if (bottom > viewportBottom - inset) next += bottom - viewportBottom + inset;
    return Math.max(0, Math.min(Math.max(0, scrollHeight - height), next));
}
