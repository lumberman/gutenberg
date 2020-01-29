/**
 * External dependencies
 */
import classnames from 'classnames';
import { noop, startsWith, uniqueId } from 'lodash';

/**
 * WordPress dependencies
 */
import { Button, ExternalLink, VisuallyHidden } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { useCallback, useState, Fragment } from '@wordpress/element';
import {
	safeDecodeURI,
	filterURLForDisplay,
	isURL,
	prependHTTP,
	getProtocol,
} from '@wordpress/url';
import { useInstanceId } from '@wordpress/compose';
import { useSelect } from '@wordpress/data';

/**
 * Internal dependencies
 */
import LinkControlSettingsDrawer from './settings-drawer';
import LinkControlSearchItem from './search-item';
import LinkControlSearchInput from './search-input';
import LinkControlSearchCreate from './search-create-button';

const CREATE_TYPE = '__CREATE__';

function LinkControl( {
	value,
	settings,
	onChange = noop,
	showInitialSuggestions,
	showCreateEntity,
	createEntity,
} ) {
	const instanceId = useInstanceId( LinkControl );
	const [ inputValue, setInputValue ] = useState( ( value && value.url ) || '' );
	const [ isEditingLink, setIsEditingLink ] = useState( ! value || ! value.url );
	const [ isResolvingLink, setIsResolvingLink ] = useState( false );
	const [ errorMsg, setErrorMsg ] = useState( null );

	const { fetchSearchSuggestions } = useSelect( ( select ) => {
		const { getSettings } = select( 'core/block-editor' );
		return {
			fetchSearchSuggestions: getSettings().__experimentalFetchLinkSuggestions,
		};
	}, [] );
	const displayURL = ( value && filterURLForDisplay( safeDecodeURI( value.url ) ) ) || '';

	/**
	 * onChange LinkControlSearchInput event handler
	 *
	 * @param {string} val Current value returned by the search.
	 */
	const onInputChange = ( val = '' ) => {
		setErrorMsg( null ); // remove lingering error messages
		setInputValue( val );
	};

	const resetInput = () => {
		setErrorMsg( null ); // remove lingering error messages
		setInputValue( '' );
	};

	const handleDirectEntry = ( val ) => {
		let type = 'URL';

		const protocol = getProtocol( val ) || '';

		if ( protocol.includes( 'mailto' ) ) {
			type = 'mailto';
		}

		if ( protocol.includes( 'tel' ) ) {
			type = 'tel';
		}

		if ( startsWith( val, '#' ) ) {
			type = 'internal';
		}

		return Promise.resolve(
			[ {
				id: uniqueId(),
				title: val,
				url: type === 'URL' ? prependHTTP( val ) : val,
				type,
			} ]
		);
	};

	const handleEntitySearch = async ( val, args ) => {
		let results = await Promise.all( [
			fetchSearchSuggestions( val, {
				...( args.isInitialSuggestions ? { perPage: 3 } : {} ),
			} ),
			handleDirectEntry( val ),
		] );

		const couldBeURL = ! val.includes( ' ' );

		// If it's potentially a URL search then concat on a URL search suggestion
		// just for good measure. That way once the actual results run out we always
		// have a URL option to fallback on.
		results = couldBeURL && ! args.isInitialSuggestions ? results[ 0 ].concat( results[ 1 ] ) : results[ 0 ];

		// Here we append a faux suggestion to represent a "CREATE" option. This
		// is detected in the rendering of the search results and handeled as a
		// special case. This is currently necessary because the suggestions
		// dropdown will only appear if there are valid suggestions and
		// therefore unless the create option is a suggestion it will not
		// display in scenarios where there are no results returned from the
		// API. In addition promoting CREATE to a first class suggestion affords
		// the a11y benefits afforded by `URLInput` to all suggestions (eg:
		// keyboard handling, ARIA roles...etc).
		return results.concat( {
			id: uniqueId(),
			title: '',
			url: '',
			type: CREATE_TYPE,
		} );
	};

	/**
	 * Detmineres which type of search handler to use based on the users input.
	 * Anything that is definitely a URL is handled only as a Direct Entry and no
	 * request should be made for search results from an API. For anything
	 * else a API search should made for matching Entities.
	 */
	const getSearchHandler = useCallback( ( val, args ) => {
		const protocol = getProtocol( val ) || '';
		const isMailto = protocol.includes( 'mailto' );
		const isInternal = startsWith( val, '#' );
		const isTel = protocol.includes( 'tel' );

		const maybeURL = isInternal || isMailto || isTel || isURL( val ) || ( val && val.includes( 'www.' ) );

		return ( maybeURL ) ? handleDirectEntry( val, args ) : handleEntitySearch( val, args );
	}, [ handleDirectEntry, fetchSearchSuggestions ] );

	// Render Components
	const renderSearchResults = ( { suggestionsListProps, buildSuggestionItemProps, suggestions, selectedSuggestion, isLoading, isInitialSuggestions } ) => {
		const resultsListClasses = classnames( 'block-editor-link-control__search-results', {
			'is-loading': isLoading,
		} );

		const directLinkEntryTypes = [ 'url', 'mailto', 'tel', 'internal' ];
		const isSingleDirectEntryResult = suggestions.length === 1 && directLinkEntryTypes.includes( suggestions[ 0 ].type.toLowerCase() );
		const shouldShowCreateEntity = showCreateEntity && createEntity && ! isSingleDirectEntryResult && ! isInitialSuggestions;

		// According to guidelines aria-label should be added if the label
		// itself is not visible.
		// See: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/listbox_role
		const searchResultsLabelId = isInitialSuggestions ? `block-editor-link-control-search-results-label-${ instanceId }` : undefined;
		const labelText = isInitialSuggestions ? __( 'Recently updated' ) : sprintf( __( 'Search results for %s' ), inputValue );
		const ariaLabel = isInitialSuggestions ? undefined : labelText;
		const SearchResultsLabel = (
			<span className="block-editor-link-control__search-results-label" id={ searchResultsLabelId } aria-label={ ariaLabel } >
				{ labelText }
			</span>
		);

		return (
			<div className="block-editor-link-control__search-results-wrapper">
				{ isInitialSuggestions ? SearchResultsLabel : <VisuallyHidden>{ SearchResultsLabel }</VisuallyHidden> }

				<div { ...suggestionsListProps } className={ resultsListClasses } aria-labelledby={ searchResultsLabelId }>
					{ suggestions.map( ( suggestion, index ) => {
						if ( shouldShowCreateEntity && CREATE_TYPE === suggestion.type ) {
							return (
								<LinkControlSearchCreate
									searchTerm={ inputValue }
									onClick={ async () => {
										setIsResolvingLink( true );
										setErrorMsg( null );

										let newEntity;

										try {
											newEntity = await createEntity( 'page', inputValue );
										} catch ( error ) {
											setErrorMsg( error.msg || __( 'An unknown error occurred during Page creation. Please try again.' ) );
										}

										setIsResolvingLink( false );

										if ( newEntity ) { // only set if request is resolved
											onChange( newEntity );
											setIsEditingLink( false );
										} else {
											setIsEditingLink( true );
										}
									} }
									key={ `${ suggestion.id }-${ suggestion.type }` }
									itemProps={ buildSuggestionItemProps( suggestion, index ) }
									isSelected={ index === selectedSuggestion }
								/>
							);
						}

						// If we're not handling "Create" suggestions above then
						// we don't want them in the main results so exit early
						if ( CREATE_TYPE === suggestion.type ) {
							return null;
						}

						return (
							<LinkControlSearchItem
								key={ `${ suggestion.id }-${ suggestion.type }` }
								itemProps={ buildSuggestionItemProps( suggestion, index ) }
								suggestion={ suggestion }
								onClick={ () => {
									setIsEditingLink( false );
									onChange( { ...value, ...suggestion } );
								} }
								isSelected={ index === selectedSuggestion }
								isURL={ directLinkEntryTypes.includes( suggestion.type.toLowerCase() ) }
								searchTerm={ inputValue }
							/>
						)
						;
					} ) }

				</div>

			</div>
		);
	};

	return (
		<div className="block-editor-link-control">

			{ isResolvingLink && (
				<div
					className={ classnames( 'block-editor-link-control__search-item', {
						'is-current': true,
					} ) }
				>
					<span className="block-editor-link-control__search-item-header">
						<span
							className="block-editor-link-control__search-item-title"
						>
							{ __( 'Creating Page' ) }
						</span>
						<span className="block-editor-link-control__search-item-info">
							{ __( 'Your new Page is being created' ) }.
						</span>
					</span>
				</div>
			) }

			{ ( ! isEditingLink && ! isResolvingLink ) && (
				<Fragment>
					<VisuallyHidden>
						<p aria-label={ __( 'Currently selected' ) } id={ `current-link-label-${ instanceId }` }>
							{ __( 'Currently selected' ) }:
						</p>
					</VisuallyHidden>
					<div
						aria-labelledby={ `current-link-label-${ instanceId }` }
						aria-selected="true"
						className={ classnames( 'block-editor-link-control__search-item', {
							'is-current': true,
						} ) }
					>
						<span className="block-editor-link-control__search-item-header">
							<ExternalLink
								className="block-editor-link-control__search-item-title"
								href={ value.url }
							>
								{ ( value && value.title ) || displayURL }
							</ExternalLink>
							{ value && value.title && (
								<span className="block-editor-link-control__search-item-info">
									{ displayURL }
								</span>
							) }
						</span>

						<Button
							isSecondary
							onClick={ () => setIsEditingLink( true ) }
							className="block-editor-link-control__search-item-action block-editor-link-control__search-item-action--edit"
						>
							{ __( 'Edit' ) }
						</Button>
					</div>
				</Fragment>
			) }

			{ isEditingLink && ! isResolvingLink && (
				<LinkControlSearchInput
					value={ inputValue }
					onChange={ onInputChange }
					onSelect={ ( suggestion ) => {
						setIsEditingLink( false );
						onChange( { ...value, ...suggestion } );
					} }
					renderSuggestions={ renderSearchResults }
					fetchSuggestions={ getSearchHandler }
					onReset={ resetInput }
					showInitialSuggestions={ showInitialSuggestions }
					errorMsg={ errorMsg }
				/>
			) }

			{ ! isEditingLink && ! isResolvingLink && (
				<LinkControlSettingsDrawer value={ value } settings={ settings } onChange={ onChange } />
			) }
		</div>
	);
}

export default LinkControl;
