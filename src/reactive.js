import React from 'react'
import { Subject, noop } from 'rxjs'
import { switchMap, publishReplay, refCount } from 'rxjs/operators'
import { combine, unsubscribe, isReactComponent, getDisplayName, isPlainObject, once, isSource } from './shared'

const defaults = { displayName: '', PureComponent: true }
const reactive = options => Component => {
	const settings = { ...defaults, ...options }
	const ReactComponent = makeReactComponent(Component, settings.PureComponent)
	class ReactiveComponent extends ReactComponent {
		$$agent = createReactiveAgent(this, super.render, settings)
		componentDidMount() {
			this.$$agent.handleMounted()
			super.componentDidMount && super.componentDidMount()
		}
		componentWillUnmount() {
			this.$$agent.handleUnmount()
			super.componentWillUnmount && super.componentWillUnmount()
		}
		render() {
			return this.$$agent.render()
		}
	}
	const displayName = settings.displayName || getDisplayName(ReactComponent)
	ReactiveComponent.displayName = `Reactive(${displayName})`
	return ReactiveComponent
}

const createReactiveAgent = (instance, superRender, settings) => {
	let view = null
	let subscriptions = []
	let subject = new Subject()
	let clearSubscriptions = () => {
		while (subscriptions.length > 1) {
			subscriptions.shift().unsubscribe()
		}
	}
	let toView = vdom => {
		const view$ = combine(vdom).pipe(publishReplay(1), refCount())
		/**
		 * switchMap will unsub the stream which break the refCount in combine(vdom)
		 * maintain a sub of noop to keep it
		 * and unsub the sub in next update frame
		 */
		subscriptions.push(view$.subscribe(noop))
		return view$.pipe(once(clearSubscriptions))
	}
	let view$ = subject.pipe(switchMap(toView))
	let hasRequestAnimation = false
	let handleView = nextView => {
		view = nextView
		if (mounted && !isRendering) {
			if (hasRequestAnimation) return
			hasRequestAnimation = true
			requestAnimationFrame(refresh)
		}
	}
	let subscription = view$.subscribe(handleView)
	let isRefresh = false
	let refresh = () => {
		hasRequestAnimation = false
		if (!mounted) return
		isRefresh = true
		instance.forceUpdate()
		isRefresh = false
	}
	let mounted = false
	let handleMounted = () => {
		mounted = true
	}
	let handleUnmount = () => {
		mounted = false
		subscription.unsubscribe()
		subscriptions.forEach(unsubscribe)
	}
	let isRendering = false
	let render = () => {
		if (!mounted || !isRefresh) {
			isRendering = true
			subject.next(superRender.call(instance))
			isRendering = false
		}
		return view
	}

	return {
		render,
		handleMounted,
		handleUnmount
	}
}

const makeReactComponent = (Component, PureComponent) => {
	if (isReactComponent(Component)) return Component
	const factory = Component
	const SuperComponent = PureComponent ? React.PureComponent : React.Component
	class FactoryComponent extends SuperComponent {
		render() {
			return factory(this.props)
		}
	}
	FactoryComponent.displayName = getDisplayName(Component)
	return FactoryComponent
}

export default function(param) {
	// turn react element to observable
	if (React.isValidElement(param)) {
		const reactElement$ = combine(param)
		param = () => reactElement$
		param.displayName = 'Element'
	}

	// treat observable as react functional component
	if (isSource(param)) {
		const reactElement$ = param
		param = () => reactElement$
		param.displayName = 'Value'
	}

	// handle config object
	if (param === undefined || isPlainObject(param)) {
		return reactive(param)
	}

	return reactive()(param)
}
