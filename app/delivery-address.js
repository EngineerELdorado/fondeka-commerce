'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { isDeliveryCountryCode } from '../lib/commerce-delivery.mjs';
import COUNTRY_DATA from '../src/data/countries';
import { CommerceIcon, DropdownChevron } from './commerce-ui';
import './delivery-address.css';

const COPY = {
    en: {
        country: 'Delivery country', chooseCountry: 'Choose a country', region: 'Province or region',
        town: 'Town or city', address: 'Full address', postal: 'Postal code', instructions: 'Delivery instructions',
        optional: 'optional', addressHelp: 'Street, building, apartment and nearby landmark, if useful.',
        instructionsPlaceholder: 'For example, call on arrival.',
        enterManually: 'Not listed? Enter manually', useSuggestions: 'Choose from the list',
        searchCountry: 'Search countries', searchRegion: 'Search provinces or regions', searchTown: 'Search towns',
        noMatches: 'No matching places.', chooseCountryFirst: 'Choose a country first', clear: 'Clear selection', searchPlaceholder: 'Search…',
        moreSpecific: 'More specific area', chooseAreaPlaceholder: 'Choose a province or region', chooseSpecific: 'Choose an area',
        loading: 'Loading suggestions…', unavailable: 'Suggestions are unavailable. Enter this place manually.',
        more: 'Show more towns', chooseTown: 'Choose a town or city',
        remember: 'Save this address on this device',
        rememberHelp: 'Reuse it next time. You can change or remove it.', saved: 'Saved on this device',
        deliveryAddress: 'Delivery address', change: 'Change address', forget: 'Forget saved address',
        requiredCountry: 'Choose a delivery country.', requiredTown: 'Enter a town or city.', requiredAddress: 'Enter the full address.',
        invalidCountry: 'Choose a valid country.', invalidCharacters: 'Remove unsupported control characters.',
        invalidValue: 'Check this field.', tooLong: 'Use no more than {max} characters.',
    },
    fr: {
        country: 'Pays de livraison', chooseCountry: 'Choisir un pays', region: 'Province ou region',
        town: 'Ville', address: 'Adresse complète', postal: 'Code postal', instructions: 'Instructions de livraison',
        optional: 'facultatif', addressHelp: 'Rue, bâtiment, appartement et repère utile, si nécessaire.',
        instructionsPlaceholder: 'Par exemple, appeler à l’arrivée.',
        enterManually: 'Pas dans la liste ? Saisir manuellement', useSuggestions: 'Choisir dans la liste',
        searchCountry: 'Rechercher un pays', searchRegion: 'Rechercher une province ou région', searchTown: 'Rechercher une ville',
        noMatches: 'Aucun lieu correspondant.', chooseCountryFirst: 'Choisissez d’abord un pays', clear: 'Effacer la sélection', searchPlaceholder: 'Rechercher…',
        moreSpecific: 'Zone plus précise', chooseAreaPlaceholder: 'Choisir une province ou région', chooseSpecific: 'Choisir une zone',
        loading: 'Chargement des suggestions…', unavailable: 'Suggestions indisponibles. Saisissez ce lieu manuellement.',
        more: 'Voir plus de villes', chooseTown: 'Choisir une ville',
        remember: 'Enregistrer cette adresse sur cet appareil',
        rememberHelp: 'Réutilisez-la la prochaine fois. Vous pourrez la modifier ou la supprimer.', saved: 'Enregistrée sur cet appareil',
        deliveryAddress: 'Adresse de livraison', change: 'Modifier l’adresse', forget: 'Oublier l’adresse enregistrée',
        requiredCountry: 'Choisissez un pays de livraison.', requiredTown: 'Saisissez une ville.', requiredAddress: 'Saisissez l’adresse complète.',
        invalidCountry: 'Choisissez un pays valide.', invalidCharacters: 'Retirez les caractères de contrôle non pris en charge.',
        invalidValue: 'Vérifiez ce champ.', tooLong: 'Utilisez au maximum {max} caractères.',
    },
};

const LIMITS = { countryCode: 2, region: 160, town: 160, fullAddress: 1000, postalCode: 32, deliveryInstructions: 500 };
const text = value => typeof value === 'string' ? value : '';
const localeFor = language => String(language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
const suggestions = value => Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string') : [];

function countryName(code, language) {
    try { return new Intl.DisplayNames([language], { type: 'region' }).of(code) || code; }
    catch { return COUNTRY_DATA.find(country => country.cca2 === code)?.name || code; }
}

function errorMessage(code, field, copy) {
    if (!code) return '';
    if (code === 'required') return field === 'countryCode' ? copy.requiredCountry : field === 'town' ? copy.requiredTown : copy.requiredAddress;
    if (code === 'tooLong') return copy.tooLong.replace('{max}', LIMITS[field]);
    return copy[code] || copy.invalidValue;
}

// Search only filters the catalog. An address changes after a result is chosen.
function LocationPicker({ id, label, optional, value, options, placeholder, searchLabel, copy, open, onOpen, onClose, onSelect, onManual, onClear, loading = false, disabled = false, query, onQueryChange, hasNext = false, onMore, error, describedBy }) {
    const [localQuery, setLocalQuery] = useState('');
    const root = useRef(null);
    const trigger = useRef(null);
    const search = useRef(null);
    const filter = query ?? localQuery;
    const fold = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    const choices = onQueryChange ? options : options.filter(option => fold(`${option.name} ${option.detail || ''}`).includes(fold(filter.trim())));
    useEffect(() => {
        if (open) search.current?.focus({ preventScroll: true });
        else setLocalQuery('');
    }, [open]);
    return <div className="delivery-location-picker" ref={root} data-dialog-escape-scope={open ? '' : undefined} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) onClose();
    }} onKeyDown={event => {
        if (!open) return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); trigger.current?.focus(); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            const results = [...root.current.querySelectorAll('[data-location-option]')];
            const index = results.indexOf(document.activeElement);
            if (results.length) { event.preventDefault(); results[(index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length]?.focus(); }
        }
    }}>
        <label id={`${id}-label`} htmlFor={id}>{label}{optional && <small> ({copy.optional})</small>}</label>
        <button id={id} ref={trigger} type="button" className={`delivery-location-trigger${value ? ' is-selected' : ''}`} disabled={disabled} aria-expanded={open} aria-controls={`${id}-options`} aria-invalid={Boolean(error)} aria-describedby={describedBy} aria-labelledby={`${id}-label ${id}-value`} onClick={() => open ? onClose() : onOpen()} onKeyDown={event => {
            if (event.key === 'ArrowDown' && !open) { event.preventDefault(); onOpen(); }
        }}>
            <span id={`${id}-value`}>{value || placeholder}</span>
            {value && <CommerceIcon name="check" size={18} className="delivery-location-check" />}
            <DropdownChevron />
        </button>
        {open && <div id={`${id}-options`} className="delivery-location-options" role="region" aria-labelledby={`${id}-label`} aria-busy={loading}>
            <input ref={search} type="search" className="delivery-location-search" value={filter} placeholder={copy.searchPlaceholder} aria-label={searchLabel} maxLength={100} disabled={disabled} autoComplete="off" onChange={event => onQueryChange ? onQueryChange(event.target.value) : setLocalQuery(event.target.value)} />
            {choices.length > 0 && <ul className="delivery-location-results">{choices.map(option => <li key={option.id}><button type="button" data-location-option onClick={() => onSelect(option.id)} disabled={disabled || loading} aria-current={value === option.name ? 'true' : undefined}>
                <span><span>{option.name}</span>{option.detail && <small>{option.detail}</small>}</span>
                <CommerceIcon name={value === option.name ? 'check' : 'arrow'} size={17} />
            </button></li>)}</ul>}
            <p className="delivery-location-status" role="status">{loading ? copy.loading : !choices.length ? copy.noMatches : ''}</p>
            {hasNext && <button type="button" className="commerce-text-button delivery-address-browse" onClick={onMore} disabled={disabled || loading}>{copy.more}</button>}
            {(onManual || onClear) && <div className="delivery-location-alternatives">
                {onManual && <button type="button" className="commerce-text-button delivery-address-browse" onClick={onManual} disabled={disabled}>{copy.enterManually}<CommerceIcon name="arrow" size={15} /></button>}
                {onClear && value && <button type="button" className="commerce-text-button delivery-address-browse" onClick={onClear} disabled={disabled}>{copy.clear}</button>}
            </div>}
        </div>}
    </div>;
}

export function DeliveryAddressSummary({ address, language = 'en', onEdit, onForget, disabled = false }) {
    const locale = localeFor(language);
    const copy = COPY[locale];
    if (!address || !text(address.fullAddress).trim()) return null;
    const country = text(address.countryName) || countryName(text(address.countryCode), locale);
    const locality = [text(address.town), text(address.region), text(address.postalCode)].filter(Boolean).join(', ');
    return (
        <section className="delivery-address-summary" aria-label={copy.deliveryAddress}>
            <div className="delivery-address-summary-heading"><span className="commerce-icon-tile"><CommerceIcon name="delivery" size={20} /></span><div><h4>{copy.deliveryAddress}</h4>{onForget && <small>{copy.saved}</small>}</div></div>
            <div className="delivery-address-summary-lines"><p>{text(address.fullAddress)}</p>{locality && <p>{locality}</p>}{country && <p>{country}</p>}</div>
            {address.deliveryInstructions && <p className="delivery-address-instructions">{text(address.deliveryInstructions)}</p>}
            {(onEdit || onForget) && <div className="delivery-address-summary-actions">{onEdit && <button type="button" className="commerce-text-button" onClick={onEdit} disabled={disabled}>{copy.change}</button>}{onForget && <button type="button" className="commerce-text-button delivery-address-forget" onClick={onForget} disabled={disabled}>{copy.forget}</button>}</div>}
        </section>
    );
}

export default function DeliveryAddressFields({ value = {}, onChange, language = 'en', errors = {}, disabled = false, remember = true, onRememberChange, saved = false, onForgetSaved }) {
    const locale = localeFor(language);
    const copy = COPY[locale];
    const prefix = useId();
    const [editing, setEditing] = useState(!saved);
    const [countries, setCountries] = useState([]);
    const [activePicker, setActivePicker] = useState(null);
    const [regionManual, setRegionManual] = useState(false);
    const [regionLevels, setRegionLevels] = useState([]);
    const [regionPath, setRegionPath] = useState([]);
    const [regionUnavailable, setRegionUnavailable] = useState(false);
    const [townManual, setTownManual] = useState(false);
    const [townQuery, setTownQuery] = useState('');
    const [towns, setTowns] = useState([]);
    const [townPage, setTownPage] = useState(0);
    const [townRevision, setTownRevision] = useState(0);
    const [townHasNext, setTownHasNext] = useState(false);
    const [townLoading, setTownLoading] = useState(true);
    const [townUnavailable, setTownUnavailable] = useState(false);
    const previousSaved = useRef(saved);
    const childRequest = useRef(null);
    const country = text(value.countryCode).toUpperCase();
    const regionId = regionPath.at(-1)?.id || '';
    const fallbackCountries = useMemo(() => COUNTRY_DATA.filter(item => isDeliveryCountryCode(item.cca2)).map(item => ({ code: item.cca2, name: countryName(item.cca2, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)), [locale]);
    const countryChoices = countries.length ? countries : fallbackCountries;
    const read = (path, signal) => apiFetch(`/public/commerce/delivery${path}`, { signal, cache: 'force-cache', headers: { 'Accept-Language': locale } });
    const update = (field, nextValue) => onChange?.({ ...value, [field]: nextValue });
    const fieldProps = field => ({
        id: `${prefix}-${field}`, disabled, 'aria-invalid': Boolean(errors[field]),
        'aria-describedby': errors[field] ? `${prefix}-${field}-error` : undefined,
    });
    const fieldError = field => errors[field] ? <span className="field-error" id={`${prefix}-${field}-error`}>{errorMessage(errors[field], field, copy)}</span> : null;
    const pickerProps = (name, field) => ({
        id: `${prefix}-${name}`, copy, disabled, open: activePicker === name,
        onOpen: () => setActivePicker(name), onClose: () => setActivePicker(current => current === name ? null : current),
        error: errors[field], describedBy: errors[field] ? `${prefix}-${field}-error` : undefined,
    });
    const manualRegion = regionManual || regionUnavailable;
    const manualTown = townManual || townUnavailable;
    const resetTowns = () => { setTowns([]); setTownPage(0); setTownQuery(''); setTownManual(false); setTownUnavailable(false); setTownLoading(true); setTownRevision(current => current + 1); };

    useEffect(() => {
        if (saved && !previousSaved.current) setEditing(false);
        if (!saved && previousSaved.current) setEditing(true);
        previousSaved.current = saved;
    }, [saved]);
    useEffect(() => { if (Object.keys(errors).length) setEditing(true); }, [errors]);

    useEffect(() => {
        const task = new AbortController();
        setCountries([]);
        read('/countries', task.signal).then(payload => {
            if (task.signal.aborted) return;
            const options = Array.isArray(payload?.countries) ? payload.countries.filter(item => isDeliveryCountryCode(item?.code) && typeof item?.name === 'string') : [];
            setCountries(options);
        }).catch(() => { /* The bundled country list remains available. */ });
        return () => task.abort();
    }, [locale]);

    useEffect(() => {
        const task = new AbortController();
        childRequest.current?.abort();
        setRegionPath([]);
        setRegionLevels([]);
        setRegionUnavailable(false);
        setTownPage(0);
        setTowns([]);
        setTownQuery('');
        setTownManual(false);
        setRegionManual(false);
        if (/^[A-Z]{2}$/.test(country)) {
            setRegionLevels([{ choices: [], loading: true }]);
            read(`/countries/${encodeURIComponent(country)}/regions`, task.signal).then(payload => {
                if (task.signal.aborted) return;
                const choices = suggestions(payload?.regions);
                setRegionLevels([{ choices, loading: false }]);
                setRegionUnavailable(payload?.suggestionsAvailable === false || !choices.length);
            }).catch(() => {
                if (!task.signal.aborted) { setRegionLevels([]); setRegionUnavailable(true); }
            });
        }
        return () => { task.abort(); childRequest.current?.abort(); };
    }, [country, locale]);

    useEffect(() => {
        if (townManual || !/^[A-Z]{2}$/.test(country)) return;
        const task = new AbortController();
        setTownLoading(true);
        setTownUnavailable(false);
        if (townPage === 0) setTowns([]);
        const timer = window.setTimeout(() => {
            const params = new URLSearchParams({ query: townQuery.trim(), page: String(townPage), size: '20' });
            if (regionId) params.set('regionId', regionId);
            read(`/countries/${encodeURIComponent(country)}/towns?${params}`, task.signal).then(payload => {
                if (task.signal.aborted) return;
                const options = suggestions(payload?.content);
                setTowns(previous => townPage === 0 ? options : [...previous, ...options.filter(option => !previous.some(item => item.id === option.id))]);
                setTownHasNext(payload?.hasNext === true);
                setTownUnavailable(payload?.suggestionsAvailable === false || (!options.length && townPage === 0 && !townQuery.trim()));
            }).catch(() => { if (!task.signal.aborted) { setTownUnavailable(true); setTownHasNext(false); } })
                .finally(() => { if (!task.signal.aborted) setTownLoading(false); });
        }, 250);
        return () => { task.abort(); window.clearTimeout(timer); };
    }, [country, regionId, townQuery, townPage, townManual, townRevision, locale]);

    const selectRegion = (level, id) => {
        childRequest.current?.abort();
        const selected = regionLevels[level]?.choices.find(item => item.id === id);
        const nextPath = [...regionPath.slice(0, level), ...(selected ? [selected] : [])];
        setRegionPath(nextPath);
        setRegionLevels(previous => previous.slice(0, level + 1));
        onChange?.({ ...value, region: text(nextPath.at(-1)?.name), town: '' });
        resetTowns();
        if (!selected) { setActivePicker(null); return; }
        setActivePicker(`area-${level + 1}`);
        const task = new AbortController();
        childRequest.current = task;
        setRegionLevels(previous => [...previous, { choices: [], loading: true }]);
        read(`/countries/${encodeURIComponent(country)}/regions?${new URLSearchParams({ parentId: selected.id })}`, task.signal).then(payload => {
            if (task.signal.aborted) return;
            const choices = suggestions(payload?.regions);
            setRegionLevels(previous => [...previous.slice(0, level + 1), ...(choices.length ? [{ choices, loading: false }] : [])]);
            setActivePicker(current => current === `area-${level + 1}` && !choices.length ? 'town' : current);
        }).catch(() => {
            if (!task.signal.aborted) {
                setRegionLevels(previous => previous.slice(0, level + 1));
                setActivePicker(current => current === `area-${level + 1}` ? 'town' : current);
            }
        });
    };

    if (saved && !editing) return <DeliveryAddressSummary address={value} language={locale} disabled={disabled} onEdit={() => setEditing(true)} onForget={onForgetSaved ? () => { setEditing(true); onForgetSaved(); } : undefined} />;

    return (
        <div className="delivery-address-fields">
            <div className="commerce-field delivery-address-wide">
                <LocationPicker {...pickerProps('countryCode', 'countryCode')} label={copy.country} value={country ? countryChoices.find(option => option.code === country)?.name || countryName(country, locale) : ''} options={countryChoices.map(option => ({ id: option.code, name: option.name }))} placeholder={copy.chooseCountry} searchLabel={copy.searchCountry} onSelect={code => {
                    if (code === country) { setActivePicker(null); return; }
                    childRequest.current?.abort(); setRegionPath([]); setRegionLevels([{ choices: [], loading: true }]); setRegionUnavailable(false); setRegionManual(false); resetTowns(); setActivePicker('area-0');
                    onChange?.({ ...value, countryCode: code, region: '', town: '' });
                }} />
                {fieldError('countryCode')}
            </div>
            <div className="commerce-field delivery-address-wide">
                {manualRegion ? <>
                    <label htmlFor={`${prefix}-region`}>{copy.region} <small>({copy.optional})</small></label>
                    <input {...fieldProps('region')} value={text(value.region)} autoComplete="address-level1" maxLength={160} onChange={event => {
                        childRequest.current?.abort(); setRegionPath([]); setRegionLevels(previous => previous.slice(0, 1)); resetTowns();
                        onChange?.({ ...value, region: event.target.value, town: '' });
                    }} />
                    {regionUnavailable ? <p className="delivery-field-help" role="status">{copy.unavailable}</p> : <button type="button" className="commerce-text-button delivery-address-browse" onClick={() => { setRegionManual(false); setActivePicker('area-0'); }} disabled={disabled}>{copy.useSuggestions}<CommerceIcon name="chevron" size={15} /></button>}
                </> : (regionLevels.length ? regionLevels : [{ choices: [], loading: Boolean(country) }]).map((level, index) => <LocationPicker key={index} {...pickerProps(`area-${index}`, 'region')} disabled={disabled || !country} label={index ? copy.moreSpecific : copy.region} optional value={regionPath[index]?.name || (index === 0 && !regionPath.length ? text(value.region) : '')} options={level.choices.map(option => ({ ...option, detail: text(option.typeLocal) }))} placeholder={!country ? copy.chooseCountryFirst : level.loading ? copy.loading : index ? copy.chooseSpecific : copy.chooseAreaPlaceholder} searchLabel={copy.searchRegion} loading={level.loading} onSelect={id => selectRegion(index, id)} onClear={() => selectRegion(index, '')} onManual={() => {
                    childRequest.current?.abort(); setRegionLevels(previous => previous.slice(0, 1)); setRegionPath([]); setRegionManual(true); setActivePicker(null);
                    requestAnimationFrame(() => document.getElementById(`${prefix}-region`)?.focus());
                }} />)}
                {fieldError('region')}
            </div>
            <div className="commerce-field">
                {manualTown ? <>
                    <label htmlFor={`${prefix}-town`}>{copy.town}</label>
                    <input {...fieldProps('town')} value={text(value.town)} autoComplete="address-level2" maxLength={160} aria-required="true" onChange={event => update('town', event.target.value)} />
                    {townUnavailable ? <p className="delivery-field-help" role="status">{copy.unavailable}</p> : <button type="button" className="commerce-text-button delivery-address-browse" onClick={() => { setTownManual(false); setTownQuery(''); setTownPage(0); setActivePicker('town'); }} disabled={disabled}>{copy.useSuggestions}<CommerceIcon name="chevron" size={15} /></button>}
                </> : <LocationPicker {...pickerProps('town', 'town')} disabled={disabled || !country} label={copy.town} value={text(value.town)} options={towns} placeholder={!country ? copy.chooseCountryFirst : townLoading ? copy.loading : copy.chooseTown} searchLabel={copy.searchTown} loading={townLoading} query={townQuery} onQueryChange={query => { setTownPage(0); setTownQuery(query); setTownLoading(true); }} onSelect={id => {
                    const selected = towns.find(town => town.id === id);
                    if (selected) { update('town', selected.name); setActivePicker(null); }
                }} onManual={() => {
                    setTownManual(true); setActivePicker(null);
                    requestAnimationFrame(() => document.getElementById(`${prefix}-town`)?.focus());
                }} hasNext={townHasNext} onMore={() => setTownPage(page => page + 1)} />}
                {fieldError('town')}
            </div>
            <div className="commerce-field">
                <label htmlFor={`${prefix}-postalCode`}>{copy.postal} <small>({copy.optional})</small></label>
                <input {...fieldProps('postalCode')} value={text(value.postalCode)} autoComplete="postal-code" maxLength={32} onChange={event => update('postalCode', event.target.value)} />
                {fieldError('postalCode')}
            </div>
            <div className="commerce-field delivery-address-wide">
                <label htmlFor={`${prefix}-fullAddress`}>{copy.address}</label>
                <textarea {...fieldProps('fullAddress')} value={text(value.fullAddress)} autoComplete="street-address" rows={3} maxLength={1000} aria-required="true" aria-describedby={errors.fullAddress ? `${prefix}-fullAddress-error` : `${prefix}-address-help`} onChange={event => update('fullAddress', event.target.value)} />
                <small id={`${prefix}-address-help`} className="delivery-field-help">{copy.addressHelp}</small>
                {fieldError('fullAddress')}
            </div>
            <div className="commerce-field delivery-address-wide">
                <label htmlFor={`${prefix}-deliveryInstructions`}>{copy.instructions} <small>({copy.optional})</small></label>
                <textarea {...fieldProps('deliveryInstructions')} value={text(value.deliveryInstructions)} rows={2} maxLength={500} placeholder={copy.instructionsPlaceholder} onChange={event => update('deliveryInstructions', event.target.value)} />
                {fieldError('deliveryInstructions')}
            </div>
            {onRememberChange && <div className="delivery-address-remember delivery-address-wide"><label htmlFor={`${prefix}-remember`}><input id={`${prefix}-remember`} type="checkbox" checked={Boolean(remember)} onChange={event => onRememberChange(event.target.checked)} disabled={disabled} aria-describedby={`${prefix}-remember-help`} /><span>{copy.remember}</span></label><p id={`${prefix}-remember-help`}>{copy.rememberHelp}</p></div>}
            {saved && onForgetSaved && <button type="button" className="commerce-text-button delivery-address-forget delivery-address-wide" onClick={onForgetSaved} disabled={disabled}>{copy.forget}</button>}
        </div>
    );
}
