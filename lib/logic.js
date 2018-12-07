/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* global getParticipantRegistry getAssetRegistry getFactory */

/**
 * A shipment has been received by an importer
 * @param {org.acme.shipping.perishable.ShipmentReceived} shipmentReceived - the ShipmentReceived transaction
 * @transaction
 */
async function payOut(shipmentReceived) {  // eslint-disable-line no-unused-vars

    const contract = shipmentReceived.shipment.contract;
    const shipment = shipmentReceived.shipment;
    let payOut = contract.unitPrice * shipment.unitCount;

    console.log('Received at: ' + shipmentReceived.timestamp);
    console.log('Contract arrivalDateTime: ' + contract.arrivalDateTime);

    // set the status of the shipment
    shipment.status = 'ARRIVED';

    // if the shipment did not arrive on time the payout is zero
    if (shipmentReceived.timestamp > contract.arrivalDateTime) {
        payOut = 0;
        console.log('Late shipment');
    } else {
        // find the lowest temperature reading
        if (shipment.temperatureReadings || shipment.humidityReadings) {
            // sort the temperatureReadings by centigrade
            shipment.temperatureReadings.sort(function (a, b) {
                return (a.centigrade - b.centigrade);
            });
            const lowestTempReading = shipment.temperatureReadings[0];
            const highestTempReading = shipment.temperatureReadings[shipment.temperatureReadings.length - 1];
            let penalty = 0;
            console.log('Lowest temp reading: ' + lowestTempReading.centigrade);
            console.log('Highest temp reading: ' + highestTempReading.centigrade);

            // does the lowest temperature violate the contract?
            if (lowestTempReading.centigrade < contract.minTemperature) {
                penalty += (contract.minTemperature - lowestTempReading.centigrade) * contract.minPenaltyFactor;
                console.log('Min temp penalty: ' + penalty);
            } 

            // does the highest temperature violate the contract?
            if (highestTempReading.centigrade > contract.maxTemperature) {
                penalty += (highestTempReading.centigrade - contract.maxTemperature) * contract.maxPenaltyFactor;
                console.log('Max temp penalty: ' + penalty);
            } 

            // sort the humidityReadings by percent
            shipment.humidityReadings.sort(function (a, b) {
                return (a.percent - b.percent);
            });
            const lowestHumidityReading = shipment.humidityReadings[0];
            const highestHumidityReading = shipment.humidityReadings[shipment.humidityReadings.length - 1];
            //let penalty = 0;
            console.log('Lowest humidity reading: ' + lowestHumidityReading.percent);
            console.log('Highest humidity reading: ' + highestHumidityReading.percent);

            // does the lowest humidity violate the contract?
            if (lowestHumidityReading.percent < contract.minHumidity) {
                penalty += (contract.minHumidity - lowestHumidityReading.percent) * contract.humidityPenaltyFactor;
                console.log('Min humidity penalty: ' + penalty);
            }

            // does the highest humidity violate the contract?
            if (highestHumidityReading.percent > contract.maxHumidity) {
                penalty += (highestHumidityReading.percent - contract.maxTemperature) * contract.humidityPenaltyFactor;
                console.log('Max humidity penalty: ' + penalty);
            }

            // determine complicance status
            if (lowestTempReading.centigrade < contract.minTemperature || highestTempReading.centigrade > contract.maxTemperature || 
                lowestHumidityReading.percent < contract.minHumidity || highestHumidityReading.percent > contract.maxHumidity) {
                shipment.compliance = 'OUT_OF_COMPLIANCE'        
            } else {
                shipment.compliance = 'IN_COMPLIANCE'
            }

            // apply any penalities
            payOut -= (penalty * shipment.unitCount);

            if (payOut < 0) {
                payOut = 0;
            }
        }
    }

    console.log('Payout: ' + payOut);
    contract.grower.accountBalance += payOut;
    contract.importer.accountBalance -= payOut;

    console.log('Grower: ' + contract.grower.$identifier + ' new balance: ' + contract.grower.accountBalance);
    console.log('Importer: ' + contract.importer.$identifier + ' new balance: ' + contract.importer.accountBalance);

    // update the grower's balance
    const growerRegistry = await getParticipantRegistry('org.acme.shipping.perishable.Grower');
    await growerRegistry.update(contract.grower);

    // update the importer's balance
    const importerRegistry = await getParticipantRegistry('org.acme.shipping.perishable.Importer');
    await importerRegistry.update(contract.importer);

    // update the state of the shipment
    const shipmentRegistry = await getAssetRegistry('org.acme.shipping.perishable.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * A GPS reading has been received for a shipment
 * @param {org.acme.shipping.perishable.GpsReading} gpsReading - the GpsReading transaction
 * @transaction
 */
async function gpsReading(gpsReading) {  // eslint-disable-line no-unused-vars

    const shipment = gpsReading.shipment;

    console.log('Adding GPS ' + gpsReading.latitude + ', '+ gpsReading.longtitude + ' to shipment ' + shipment.$identifier);

    if (shipment.gpsReadings) {
        shipment.gpsReadings.push(gpsReading);
    } else {
        shipment.gpsReadings = [gpsReading];
    }

    // add the temp reading to the shipment
    const shipmentRegistry = await getAssetRegistry('org.acme.shipping.perishable.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * A humidity reading has been received for a shipment
 * @param {org.acme.shipping.perishable.HumidityReading} humidityReading - the HumidityReading transaction
 * @transaction
 */
async function humidityReading(humidityReading) {  // eslint-disable-line no-unused-vars

    const shipment = humidityReading.shipment;

    console.log('Adding humidity ' + humidityReading.percent + ' to shipment ' + shipment.$identifier);

    if (shipment.humidityReadings) {
        shipment.humidityReadings.push(humidityReading);
    } else {
        shipment.humidityReadings = [humidityReading];
    }

    // add the temp reading to the shipment
    const shipmentRegistry = await getAssetRegistry('org.acme.shipping.perishable.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * A temperature reading has been received for a shipment
 * @param {org.acme.shipping.perishable.TemperatureReading} temperatureReading - the TemperatureReading transaction
 * @transaction
 */
async function temperatureReading(temperatureReading) {  // eslint-disable-line no-unused-vars

    const shipment = temperatureReading.shipment;

    console.log('Adding temperature ' + temperatureReading.centigrade + ' to shipment ' + shipment.$identifier);

    if (shipment.temperatureReadings) {
        shipment.temperatureReadings.push(temperatureReading);
    } else {
        shipment.temperatureReadings = [temperatureReading];
    }

    // add the temp reading to the shipment
    const shipmentRegistry = await getAssetRegistry('org.acme.shipping.perishable.Shipment');
    await shipmentRegistry.update(shipment);
}

/**
 * Initialize some test assets and participants useful for running a demo.
 * @param {org.acme.shipping.perishable.SetupDemo} setupDemo - the SetupDemo transaction
 * @transaction
 */
async function setupDemo(setupDemo) {  // eslint-disable-line no-unused-vars

    const factory = getFactory();
    const NS = 'org.acme.shipping.perishable';

    // create the grower
    const grower = factory.newResource(NS, 'Grower', 'farmer@email.com');
    const growerAddress = factory.newConcept(NS, 'Address');
    growerAddress.country = 'USA';
    growerAddress.state = 'CA';
    grower.address = growerAddress;
    grower.businessName = 'Farm Company';
    grower.accountBalance = 0;

    // create the importer
    const importer = factory.newResource(NS, 'Importer', 'supermarket@email.com');
    const importerAddress = factory.newConcept(NS, 'Address');
    importerAddress.country = 'UK';
    importerAddress.city = 'London';
    importer.address = importerAddress;
    importer.businessName = 'Importer Company';
    importer.accountBalance = 0;

    // create the shipper
    const shipper = factory.newResource(NS, 'Shipper', 'shipper@email.com');
    const shipperAddress = factory.newConcept(NS, 'Address');
    shipperAddress.country = 'Panama';
    shipper.address = shipperAddress;
    shipper.businessName = 'Shipper Company';
    shipper.accountBalance = 0;
  
    // create the regulator
    const regulator = factory.newResource(NS, 'Regulator', 'regulator@email.com');
    regulator.firstName = 'John';
    regulator.lastName = 'Doe';

    // create the contract
    const contract = factory.newResource(NS, 'Contract', 'CON_001');
    contract.grower = factory.newRelationship(NS, 'Grower', 'farmer@email.com');
    contract.importer = factory.newRelationship(NS, 'Importer', 'supermarket@email.com');
    contract.shipper = factory.newRelationship(NS, 'Shipper', 'shipper@email.com');
    const tomorrow = setupDemo.timestamp;
    tomorrow.setDate(tomorrow.getDate() + 1);
    contract.arrivalDateTime = tomorrow; // the shipment has to arrive tomorrow
    contract.unitPrice = 0.5; // pay 50 cents per unit
    contract.minHumidity = 50; // min humidity for the cargo
    contract.maxHumidity = 75; // max humidity for the cargo
    contract.minTemperature = 2; // min temperature for the cargo
    contract.maxTemperature = 10; // max temperature for the cargo
    contract.minPenaltyFactor = 0.2; // we reduce the price by 20 cents for every degree below the min temp
    contract.maxPenaltyFactor = 0.1; // we reduce the price by 10 cents for every degree above the max temp
    contract.humidityPenaltyFactor = 0.01 // we reduce the price by 10 cents for every percent above the max humidity or below the min humidity

    // create the shipment
    const shipment = factory.newResource(NS, 'Shipment', 'SHIP_001');
    shipment.type = 'BANANAS';
    shipment.status = 'IN_TRANSIT';
    shipment.compliance = 'NOT_APPLICABLE';
    shipment.unitCount = 5000;
    shipment.contract = factory.newRelationship(NS, 'Contract', 'CON_001');

    // add the growers
    const growerRegistry = await getParticipantRegistry(NS + '.Grower');
    await growerRegistry.addAll([grower]);

    // add the importers
    const importerRegistry = await getParticipantRegistry(NS + '.Importer');
    await importerRegistry.addAll([importer]);

    // add the shippers
    const shipperRegistry = await getParticipantRegistry(NS + '.Shipper');
    await shipperRegistry.addAll([shipper]);
  
    // add the regulator
    const regulatorRegistry = await getParticipantRegistry(NS + '.Regulator');
    await regulatorRegistry.addAll([regulator]);

    // add the contracts
    const contractRegistry = await getAssetRegistry(NS + '.Contract');
    await contractRegistry.addAll([contract]);

    // add the shipments
    const shipmentRegistry = await getAssetRegistry(NS + '.Shipment');
    await shipmentRegistry.addAll([shipment]);
  

}