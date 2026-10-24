'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { CommerceIcon } from './commerce-ui';

export default function TrainingSyllabus({ path, messages }) {
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState({ path: null, loading: true });

    useEffect(() => {
        let cancelled = false;
        setState({ path, loading: true });
        if (!path) {
            setState({ path, status: 404 });
            return undefined;
        }
        apiFetch(path).then((outline) => {
            if (!cancelled) setState({ path, outline });
        }).catch((error) => {
            if (!cancelled) setState({ path, status: error?.payload?.statusCode || 500 });
        });
        return () => { cancelled = true; };
    }, [path, attempt]);

    const loading = state.loading || state.path !== path;
    const modules = Array.isArray(state.outline?.modules) ? state.outline.modules : [];
    const materialCount = modules.reduce((total, module) => total + (Array.isArray(module.materials) ? module.materials.length : 0), 0);
    return (
        <section className="training-syllabus" aria-busy={loading} aria-label={messages.trainingCurriculum}>
            <header className="syllabus-heading"><span className="commerce-icon-tile commerce-icon-tile--violet"><CommerceIcon name="book" size={23} /></span><div><h2>{messages.trainingCurriculum}</h2>{!loading && !state.status && <p>{messages.curriculumModules.replace('{modules}', modules.length).replace('{materials}', materialCount)}</p>}</div></header>
            {loading ? <div className="syllabus-loading" role="status"><span className="commerce-skeleton" /><span className="commerce-skeleton" /><span className="sr-only">{messages.loadingCurriculum}</span></div> : state.status ? (
                <div role="alert">
                    <p>{state.status === 404 ? messages.curriculumUnavailable : messages.curriculumError}</p>
                    {state.status !== 404 && (
                        <button type="button" className="button secondary" onClick={() => setAttempt((value) => value + 1)}>{messages.retry}</button>
                    )}
                </div>
            ) : modules.length ? (
                <ol className="training-modules">
                    {modules.map((module, index) => (
                        <li key={module.id}>
                            <details className="training-module" open>
                            <summary><span className="training-module-number">{index + 1}</span><span className="training-module-name"><h3>{module.title}</h3><small>{module.materials?.length || 0} {(module.materials?.length || 0) === 1 ? messages.materialSingular : messages.materialPlural}</small></span><span className="training-module-chevron"><CommerceIcon name="arrow" size={16} /></span></summary>
                            <ol className="training-materials">
                                {(Array.isArray(module.materials) ? module.materials : []).map((material) => (
                                    <li key={material.id}>
                                        <span className="training-material-title"><CommerceIcon name={material.type === 'FILE' ? 'file' : 'link'} size={17} />{material.title}</span>
                                        <span className="training-material-type">{messages.trainingMaterialTypes[material.type] || material.type}</span>
                                    </li>
                                ))}
                            </ol>
                            </details>
                        </li>
                    ))}
                </ol>
            ) : <p>{messages.curriculumEmpty}</p>}
        </section>
    );
}
