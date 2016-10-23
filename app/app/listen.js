import React from 'react';
import { isObject, isArray } from 'lodash';
import Debug from 'debug';
import Gab from './common/gab';
import { Request } from './common/utils';
import Sockets from './lib/sockets';
import Path from 'path';
import { withRouter } from 'react-router';
import { Script as ScriptDefaults, NoScript as NoScriptDefaults } from './common/defaults';

let debug = Debug('lodge:app:listen');

export default (Component) => {
	@withRouter
	class Listeners extends React.Component {
		constructor(props){
			super(props);
			this.displayName = 'Listeners';
			
			var _props = { ...props }
			
			let loc = _props.location;
			let pastState = loc.state || {};
			let page = pastState.page || loc.pathname;
			
			if(page.charAt(0) == '/') {
				page = page.substring(1);
			}
			
			if(!page || page =='/') page = snowUI.name;
			
			if(!loc.state) {
				debug('#### I think this produces an error...  we are pushing the last known history into the stack on first load ####');
				props.router.push({
					pathname: loc.pathname,
					query: loc.query,
					state: {
						page: loc.pathname,
						query: loc.query
					}
				});
			}
			
			console.log('LOADING Listeners', snowUI.serverRendered, props.noscript);
			
			if(!snowUI.serverRendered) {
				var w=window,d=document,e=d.documentElement,g=d.getElementsByTagName('body')[0],x=w.innerWidth||e.clientWidth||g.clientWidth,y=w.innerHeight||e.clientHeight||g.clientHeight;
				var desktop = x <= snowUI.breaks.xs.width ? 'xs' : x < snowUI.breaks.sm.width ? 'sm' : 'md';
				var contentWidth =  x * (!desktop ? 1 : desktop == 'md' ? 0.80 : 0.80);
			} else {
				var x = 1200;
				var y = 600;
				var desktop = 'md';
				var contentWidth = 0.8;
			} 
			
			this.state = Object.assign({ 
				_defaults: props.noscript ? NoScriptDefaults : ScriptDefaults,
				connected: false,
				contentWidth,
				desktop,
				firstrun: !snowUI.serverRendered,
				initialData: snowUI.loaded ? false : props.renderInitialData,
				mounted: false,
				path: page,
				page: snowUI.name,
				Request: Request.bind(this),
				sockets: Sockets,
				Sockets,
				window: { width: x, height: y },	
			}, _props);
			
			debug('INITIAL ASSETS', this.state.assets);
			debug('new state:', this.state);
			
			if(!snowUI.serverRendered) {
				// start sockets
				debug('START SOCKETS');
				this.initiate();
			}
			
			snowUI.page = this.state.page;
			snowUI.path = this.state.path;
			
			this.newState = this.newState.bind(this);
		}
		
		componentWillReceiveProps(props) {
			
			const State = { ...props.location.state } || {};
			delete State.theme;
			debug('Listener received props', props, 'current state', this.state);
			debug('Listener update proposed changes:', State);
			this.newState(Object.assign({ ...State }, props));
			this._update = true;
			
		}
		
		componentDidUpdate() {
			this.onUpdate();
			
		}
		componentWillMount() {
			
		}
		componentWillUnmount() {
			if(Sockets.connected.io) {
				Sockets.io.removeAllListeners();
			}
			Gab.removeAllListeners();
			
			snowUI.unstickyMenu();
			snowUI.code.__unmountUI();
			//window.removeEventListener("mousemove", this.mousemove);
		}
		
		componentDidMount() {
			snowUI.stickyMenu();
			snowUI.code.__mountedUI();
			this.newState({ mounted: true, initialData: false });
			debug('LOADED Listeners');
			snowUI.loaded = true;
			//window.addEventListener("mousemove", this.mousemove);
		}
		
		mousemove(e) {
			Gab.emit('mousemove', e);
		}

		initiate() {
			debug('INITIATE SOCKET LISTENERS')
			let thisComponent = this;
			
			// listen for error
			Gab.on('error',(data) => {
				this.setState({
					newalert: {
						style: 'danger',
						html: data.error,
						show: true
					}
				});
			});
			
			// receive page from request
			Gab.on('request', (data) => {
				debug('gab got page request data', data);
				thisComponent.pageResults(data);
			});
			
			// update desktop
			Gab.on('resize', (e) => { 
				var desktop = e.width <= snowUI.breaks.xs.width ? 'xs' : e.width < snowUI.breaks.sm.width ? 'sm' : 'md';
				var contentWidth =  e.width * (!desktop ? 1 : desktop == 'md' ? 0.83 : 0.74);
				debug('RESIZE #####', e, desktop);
				this.setState({ desktop, contentWidth, window: e });
			});
			
			if(snowUI.usesockets) {
				Sockets.init(() => {
					debug('set heartbeat');
					// setup a 15 sec heartbeat for socket connection loss
					this.heartbeat = setInterval(() => {
						//debug('heartbeat', Sockets.io.connected);
						if(!Sockets.io.connected && this.state.connected) {
							debug('io connect-error');
							this.setState({
								connected: false,
								newalert: {},
							});
						}
						if(Sockets.io.connected && !this.state.connected) {
							debug('io connect');
							this.setState({
								connected: true,
								newalert: {},
							});
						}
					},2500);
					
					// receive page from server
					Sockets.io.on('json', (data) => {
						debug('got page socket data', data);
						thisComponent.pageResults(data);
					});
					
					// listen for a server error event
					Sockets.io.on('error', (data) => {
						debug('received socket error event', data);
						this.setState({
							newalert: {
								show: true,
								style: 'danger',
								html: data.error
							}
						});
					});
					
				});
			} // end socket init 
			
			// window resize emitter
			let _resizing = (force = false) => {
				var w=window,d=document,e=d.documentElement,g=d.getElementsByTagName('body')[0],x=w.innerWidth||e.clientWidth||g.clientWidth,y=w.innerHeight||e.clientHeight||g.clientHeight;
				// only update once done moving
				let muchX = x < this.state.window.width ? x + 50 < this.state.window.width : x - 50 > this.state.window.width;
				let muchY = y < this.state.window.height ? y + 50 < this.state.window.height : y - 50 > this.state.window.height;
				debug((muchX || muchY) || force === true);
				if((muchX || muchY) || force === true) {
					if(snowUI.__resizing) {
						clearTimeout(snowUI.__resizing);
					}
					snowUI.__resizing = setTimeout((resize) => { debug('## SEND RESIZE EVENT ##', force);Gab.emit('resize', resize);snowUI.__resizing = false }, 500, { width: x, height: y });
				}
			}
			window.removeEventListener('resize', _resizing);
			window.addEventListener('resize', _resizing);
			
			_resizing(true);
			
			
		} // end initiate
		
		newState(state, cb) {
			this.setState(state, () => {
				// snowUI.__state = { ...this.state };
				if(cb) cb();
			});		
		}
		
		onUpdate() {
			this._update = false;
		} 
		
		pageResults(data) {
			snowUI.watingForPage = false;
			if(!data.success) {
				this.setState({
					//page: '404',
					//contents: {
					//	title: 'Page not found',
					//	slug: '404'
					//},
					data,
					newalert: {
						style: 'danger',
						html: data.message,
						show: true,
						duration: 5000
					},
				});
			} else {
				this.setState({ 
					slug: data.slug,
					contents: data.results,
					data
				}, () => {
					/* run page js for new content */
					debug('##  RUN __mountedPage() js  ############');
					snowUI.code.__mountedPage();				
				});
			}
		}
		
		render() {
			debug('render listeners state', this.state);
			return  <Component { ...this.props } { ...this.state } appState={this.newState} />;
		}
		
	}

	Listeners.propTypes = {};
	
	Listeners.defaultProps = {
		//initialData: {},
	};
	
	return Listeners;
}
