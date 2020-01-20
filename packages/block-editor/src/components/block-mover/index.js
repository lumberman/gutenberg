/**
 * External dependencies
 */
import { first, last, castArray } from 'lodash';
import classnames from 'classnames';

/**
 * WordPress dependencies
 */
import { Button, ToolbarGroup } from '@wordpress/components';
import { getBlockType } from '@wordpress/blocks';
import { Component } from '@wordpress/element';
import { withSelect } from '@wordpress/data';

/**
 * Internal dependencies
 */
import { dragHandle } from './icons';
import BlockDraggable from '../block-draggable';
import { MoveUpButton, MoveDownButton } from './mover-buttons';

export class BlockMover extends Component {
	constructor() {
		super( ...arguments );
		this.state = {
			isFocused: false,
		};
		this.onFocus = this.onFocus.bind( this );
		this.onBlur = this.onBlur.bind( this );
	}

	onFocus() {
		this.setState( {
			isFocused: true,
		} );
	}

	onBlur() {
		this.setState( {
			isFocused: false,
		} );
	}

	render() {
		const { isFirst, isLast, clientIds, isLocked, isHidden, rootClientId, orientation } = this.props;
		const { isFocused } = this.state;
		if ( isLocked || ( isFirst && isLast && ! rootClientId ) ) {
			return null;
		}

		// We emulate a disabled state because forcefully applying the `disabled`
		// attribute on the button while it has focus causes the screen to change
		// to an unfocused state (body as active element) without firing blur on,
		// the rendering parent, leaving it unable to react to focus out.
		return (
			<ToolbarGroup className={ classnames( 'block-editor-block-mover', { 'is-visible': isFocused || ! isHidden, 'is-horizontal': orientation === 'horizontal' } ) }>
				<MoveUpButton
					clientIds={ clientIds }
					onFocus={ this.onFocus }
					onBlur={ this.onBlur }
				/>
				<BlockDraggable clientIds={ clientIds }>
					{ ( { onDraggableStart, onDraggableEnd } ) => (
						<Button
							icon={ dragHandle }
							className="block-editor-block-mover__drag-handle"
							aria-hidden="true"
							// Should not be able to tab to drag handle as this
							// button can only be used with a pointer device.
							tabIndex="-1"
							onDragStart={ onDraggableStart }
							onDragEnd={ onDraggableEnd }
							draggable
						/>
					) }
				</BlockDraggable>
				<MoveDownButton
					clientIds={ clientIds }
					onFocus={ this.onFocus }
					onBlur={ this.onBlur }
				/>
			</ToolbarGroup>
		);
	}
}

export default withSelect( ( select, { clientIds } ) => {
	const { getBlock, getBlockIndex, getTemplateLock, getBlockOrder, getBlockRootClientId, getBlockListSettings } = select( 'core/block-editor' );
	const normalizedClientIds = castArray( clientIds );
	const firstClientId = first( normalizedClientIds );
	const block = getBlock( firstClientId );
	const rootClientId = getBlockRootClientId( first( normalizedClientIds ) );
	const firstIndex = getBlockIndex( firstClientId, rootClientId );
	const lastIndex = getBlockIndex( last( normalizedClientIds ), rootClientId );
	const { __experimentalMoverDirection = 'vertical' } = getBlockListSettings( rootClientId ) || {};
	const blockOrder = getBlockOrder( rootClientId );
	const isFirst = firstIndex === 0;
	const isLast = lastIndex === blockOrder.length - 1;

	return {
		blockType: block ? getBlockType( block.name ) : null,
		isLocked: getTemplateLock( rootClientId ) === 'all',
		orientation: __experimentalMoverDirection,
		rootClientId,
		firstIndex,
		isFirst,
		isLast,
	};
} )( BlockMover );
