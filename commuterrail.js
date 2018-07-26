/*

JavaScript code for a simple React-based web page to show live train departure times for a particular MBTA
commuter rail station, using the MBTA's V3 API.

This code is Copyright (C) 2018 by Edmund Schweppe, and is only intended for use as
a technical demonstrator.


 */

'use strict';

const e = React.createElement;

class SolariBoard extends React.Component {
    constructor(props) {
        super(props);
        this.state = { 
            stopId: '',
            stopName: '',
            routes: [],
            platforms: [],
            traindata: [],
            currentDate: new Date(),
            lastUpdate: new Date(),
        };
        this.loadStopInformation('place-north');
    }

    /* React component lifecycle */
    componentDidMount() {
        this.timerId = setInterval(() => this.clockTick(), 100);
    }
    componentWillUnmount() {
        clearInterval(this.timerId);
    }

    // Refresh current time every second, recheck predictions every minute
    clockTick() {
        const currentDate = this.state.currentDate;
        const lastUpdate = this.state.lastUpdate;
        const millisecBetweenRefreshes = 1000 * 60;
        const newDate = new Date();
        this.setState({
            currentDate: newDate
        });
        const millisecSinceLastRefresh = newDate.getTime() - lastUpdate.getTime();
        if (millisecSinceLastRefresh > millisecBetweenRefreshes) {
            this.refreshPredictions();
        }
    }

    /* break out into separate files? */

    loadStopInformation(stopId) {
        const platformUrl = "https://api-v3.mbta.com/stops/" + stopId + "?include=child_stops";
        var stopName = "";
        return fetch(platformUrl)
            .then (response => response.json())
            .then (json => {
                stopName = json['data'].attributes.name;
                if (json['included']) {
                    // stop has child stops (which will include any platform-specific ones);
                    // load all child stops into platforms object
                    // (some child stops will be for rapid-transit lines, but they won't show up
                    // on CR-specific routes, so don't worry about them)
                    return json['included'].map(j => {
                        return{
                            platformId: j.id,
                            platformCode: j.attributes.platform_code || 'TBD',
                        }
                    })
                } else {
                    // no child stops; assume the API only specifies one platform
                    return [{ 
                        platformId: stopId,
                        platformCode: '',
                    }]
                }
            })
            .then (platforms => {
                this.setState({
                    stopId: stopId,
                    stopName: stopName,
                    platforms: platforms
                });
                this.loadRoutesForStop(stopId);
            })
            .catch (console.log.bind(console));
    }


    loadRoutesForStop(stopId) {
        // we only want commuter-rail stops, but there's no clean way of finding them;
        // instead, we'll get the CR routes associate with the stop (which may be a parent stop like place-north)
        // and use the routes for prediction filtering
        const routeUrl = "https://api-v3.mbta.com/routes?filter[stop]=" + stopId + "&filter[type]=2";
        return fetch(routeUrl)
            .then (response => response.json())
            .then (json => {
                return json['data'].map(j => j.id)
            })
            .then (routeIds => {
                this.setState({
                    routes: routeIds,
                });
                this.loadPredictionsForStop(stopId, routeIds);
            })
            .catch (console.log.bind(console));
    }
    
    refreshPredictions() {
        const stopId = this.state.stopId;
        const routeIds = this.state.routes;
        return this.loadPredictionsForStop(stopId, routeIds);
    }

    loadPredictionsForStop(stopId, routeIds) {
        const platforms = this.state.platforms;
        const query = "include=stop,trip&filter[stop]=" + stopId + '&filter[route]=' + routeIds.join(',');
        const predictionUrl = "https://api-v3.mbta.com/predictions?" + query;
        return fetch(predictionUrl)
            .then (response => response.json())
            .then (json => {
                return json['data']
                   .filter(j => j.attributes.departure_time)
                   .map(j => {
                       const platform = platforms.find(pl => pl.platformId === j.relationships.stop.data.id);
                       return {
                           trip: j.relationships.trip.data.id,
                           departure: j.attributes.departure_time,
                           track: platform ? platform.platformCode : 'TBD',
                           status: j.attributes.status
                       }
                   });
            })
            .then (predictions => this.addTripInfo(predictions))
            .catch (console.log.bind(console));
    }

    addTripInfo(predictions) {
        const tripIds = predictions.map(p => p.trip);
        const query = "filter[id]=" + tripIds.join(',');
        const url = "https://api-v3.mbta.com/trips?" + query;
        return fetch(url)
            .then (response => { return response.json(); })
            .then (json => {
                return json['data'].map((j) => { 
                    return {
                        id: j.id, 
                        train: j.attributes.name, 
                        headsign: j.attributes.headsign,
                    }
                });
            })
            .then (trips => {
                this.updateTrainState(predictions, trips);
            })
            .catch (console.log.bind(console));
    }


    updateTrainState(preds, trips) {
        const traindata = preds.map((p) => {
            const t = trips.find(t => t.id === p.trip);
            return {
                time: new Date(p.departure),
                destination: t.headsign,
                train: t.train,
                track: p.track,
                status: p.status
            }
        }).sort((a, b) => {
            if (a.time > b.time) return 1;
            if (a.time < b.time) return -1;
            return a.train > b.train;
        });
        this.setState({
            traindata:  traindata,
            lastUpdate: new Date(),
        });
    }

    /* render method */

    render() {
        const formatOptions = {hour:'numeric', minute: 'numeric' };
        const timeFormatter = new Intl.DateTimeFormat('en-US', formatOptions)
        const traindata = this.state.traindata;
        let trains = (
                    <tr>
                    <td colSpan='*' align='center'>Data loading...</td>
                    </tr>
        );
        if (traindata) 
        {
            trains = traindata.map(t => {
                    return (
                            <tr key={t.train}>
                                <td>{timeFormatter.format(t.time)}</td>
                                <td>{t.destination}</td>
                                <td>{t.train}</td>
                                <td>{t.track}</td>
                                <td>{t.status}</td>
                            </tr>
                    )}
            );
        };
    return (
        <div className="commuter_rail_main">
            <h1>Solari Board App</h1>
            <h2>{this.state.stopName} - {this.state.currentDate.toLocaleTimeString()}</h2>
        <table>
            <thead>
            <tr>
                <th>Time</th>
                <th>Destination</th>
                <th>Train</th>
                <th>Track</th>
                <th>Status</th>
            </tr>
            </thead>
            <tbody>
{trains}
            </tbody>
        </table>
        <h3>Data last updated {this.state.lastUpdate.toLocaleTimeString()}</h3>
    </div>
    );
    }
}

const domContainer = document.querySelector('#main_container');
ReactDOM.render(e(SolariBoard), domContainer);