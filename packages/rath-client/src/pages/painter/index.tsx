import { IFieldMeta, IRow } from '@kanaries/loa';
import { observer } from 'mobx-react-lite';
import { DefaultButton, PrimaryButton, Slider, Toggle, Stack, SwatchColorPicker } from 'office-ui-fabric-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import embed, { vega } from 'vega-embed';
import ReactVega from '../../components/react-vega';
import { IVegaSubset } from '../../interfaces';
import { useGlobalStore } from '../../store';
import { deepcopy, getRange } from '../../utils';
import { batchMutInCircle, nnMic } from './utils';
import styled from 'styled-components';

const Cont = styled.div`
    /* cursor: none !important; */
`;

const PainterContainer = styled.div`
    display: flex;
    .vis-segment {
        flex-grow: 1;
    }
    .operation-segment {
        flex-grow: 0;
        flex-shrink: 0;
        min-width: 200px;
    }
`;

const COLOR_SCHEME: string[] = [];
const RAW = '4c78a8f58518e4575672b7b254a24beeca3bb279a2ff9da69d755dbab0ac';
for (let i = 0; i < RAW.length; i += 6) {
    COLOR_SCHEME.push('#' + RAW.slice(i, i + 6));
}

const colorCells = COLOR_SCHEME.map((c, i) => ({
    id: `L_${i + 1}`,
    color: c,
    label: `L_${i + 1}`,
}));

const LABEL_FIELD_KEY = '_lab_field';
const LABEL_INDEX = '_label_index';

const Painter: React.FC = (props) => {
    const container = useRef<HTMLDivElement>(null);
    const { dataSourceStore, commonStore } = useGlobalStore();
    const { cleanedData, fieldMetas } = dataSourceStore;
    const { vizSpec } = commonStore;
    const [mutData, setMutData] = useState<IRow[]>([]);
    const [nearFields, setNearFields] = useState<IFieldMeta[]>([]);
    const [nearIndex, setNearIndex] = useState<number>(0);
    const [mutFeatValues, setMutFeatValues] = useState<string[]>(colorCells.map((c) => c.id));
    const [mutFeatIndex, setMutFeatIndex] = useState<number>(1);
    const [painting, setPainting] = useState<boolean>(false);
    const [painterSize, setPainterSize] = useState<number>(1);

    const initValue = mutFeatValues[0];

    const clearPainting = useCallback(() => {
        setMutData(
            cleanedData.map((r, i) => {
                return { ...r, [LABEL_FIELD_KEY]: initValue, [LABEL_INDEX]: i };
            })
        );
    }, [cleanedData, initValue]);

    useEffect(() => {
        setMutData(
            cleanedData.map((r, i) => {
                return { ...r, [LABEL_FIELD_KEY]: initValue, [LABEL_INDEX]: i };
            })
        );
    }, [cleanedData, fieldMetas, initValue]);

    const getNearFields = useCallback(
        (data: IRow[]) => {
            const X = data.map((r) => r[LABEL_FIELD_KEY]);
            const ans: { field: IFieldMeta; score: number }[] = [];
            for (let field of fieldMetas) {
                if (true) {
                    const Y = data.map((r) => r[field.fid]);
                    const score = nnMic(X, Y);
                    ans.push({
                        field,
                        score,
                    });
                }
            }
            ans.sort((a, b) => b.score - a.score);
            setNearFields(ans.map((a) => a.field));
            console.log(ans);
        },
        [fieldMetas]
    );

    const noViz = mutData.length === 0 || fieldMetas.length === 0 || vizSpec === null;
    useEffect(() => {
        if (!noViz && container.current) {
            const mvd: any = {
                ...deepcopy(vizSpec),
                data: {
                    name: 'dataSource',
                    // values: mutData
                },
            };
            mvd.encoding.color = {
                field: LABEL_FIELD_KEY,
                type: 'nominal',
                title: 'custom feature',
                scale: {
                    domain: mutFeatValues,
                },
            };

            // @ts-ignore
            embed(container.current, mvd, {
                actions: true,
            }).then((res) => {
                res.view.change(
                    'dataSource',
                    vega
                        .changeset()
                        .remove(() => true)
                        .insert(mutData)
                );
                const xField = mvd.encoding.x.field;
                const yField = mvd.encoding.y.field;
                const xRange = getRange(mutData.map((r) => r[xField]));
                const yRange = getRange(mutData.map((r) => r[yField]));
                // const scaleX = res.view.scale('x');
                // const scaleY = res.view.scale('y');
                res.view.addEventListener('mouseover', (e, item) => {
                    if (painting && item && item.datum) {
                        // console.log(e)
                        // @ts-ignore
                        // const index = item.datum[LABEL_INDEX];

                        batchMutInCircle({
                            mutData,
                            fields: [xField, yField],
                            point: [item.datum[xField], item.datum[yField]],
                            a: xRange[1] - xRange[0],
                            b: yRange[1] - yRange[0],
                            r: painterSize,
                            key: LABEL_FIELD_KEY,
                            value: mutFeatValues[mutFeatIndex],
                        });
                        // batchMutInRange(mutData, xField, [item.datum[xField] -10, item.datum[xField] + 10], LABEL_FIELD_KEY, mutFeatValues[mutFeatIndex])
                        // batchMutInRange(mutData, yField, [item.datum[yField] -10, item.datum[yField] + 10], LABEL_FIELD_KEY, mutFeatValues[mutFeatIndex])
                        // console.log(scaleX(0), scaleY(0), scaleX(500), scaleY(5000))
                        // @ts-ignore
                        // res.view.scale('x')

                        // console.log(item, scaleX(e.layerX), scaleY(e.layerY), res.view)
                        // mutData[index][LABEL_FIELD_KEY] = 'label2'
                        res.view.change(
                            'dataSource',
                            vega
                                .changeset()
                                .remove(() => true)
                                .insert(mutData)
                        );
                    }
                });
                res.view.resize();
                res.view.runAsync();
            });
        }
    }, [noViz, vizSpec, mutData, mutFeatValues, mutFeatIndex, painting, painterSize]);

    const nearSpec = useMemo<IVegaSubset | null>(() => {
        if (nearFields.length > 0) {
            const mvd: any = {
                ...deepcopy(vizSpec),
                data: {
                    name: 'dataSource',
                    // values: mutData
                },
            };
            mvd.encoding.color = {
                field: nearFields[nearIndex].fid,
                type: nearFields[nearIndex].semanticType,
                title: nearFields[nearIndex].name || nearFields[nearIndex].fid,
            };
            return mvd;
        }
        return null;
    }, [vizSpec, nearFields, nearIndex]);

    if (noViz) {
        return <div>404</div>;
    }
    return (
        <Cont style={{ padding: '1em' }}>
            <div className="cursor rounded"></div>
            <div className="card">
                <PainterContainer>
                    <div className="vis-segment">
                        <div ref={container}></div>
                    </div>
                    <div className="operation-segment">
                        <Stack tokens={{ childrenGap: 18 }}>
                            <Stack.Item>
                                <Toggle
                                    label="Painting"
                                    checked={painting}
                                    onChange={(e, checked) => {
                                        setPainting(Boolean(checked));
                                    }}
                                />
                            </Stack.Item>
                            <Stack.Item>
                                <SwatchColorPicker
                                    selectedId={mutFeatValues[mutFeatIndex]}
                                    columnCount={5}
                                    cellShape={'circle'}
                                    colorCells={colorCells}
                                    onColorChanged={(id) => {
                                        if (id) {
                                            const targetIndex = colorCells.findIndex((f) => f.id === id);
                                            targetIndex > -1 && setMutFeatIndex(targetIndex);
                                        }
                                    }}
                                />
                            </Stack.Item>
                            <Stack.Item>
                                <Slider
                                    min={0.2}
                                    max={2}
                                    step={0.2}
                                    value={painterSize}
                                    label="Painter Size"
                                    onChanged={(e, v) => {
                                        setPainterSize(v);
                                    }}
                                />
                            </Stack.Item>
                            <Stack.Item>
                                <DefaultButton
                                    disabled
                                    text="Add label"
                                    onClick={() => {
                                        setMutFeatValues((v) => [...v, `Label ${v.length + 1}`]);
                                    }}
                                />
                            </Stack.Item>
                        </Stack>
                    </div>
                </PainterContainer>
                <div>
                    <Stack horizontal tokens={{ childrenGap: 10 }}>
                        <PrimaryButton
                            text="Search"
                            iconProps={{ iconName: 'Search' }}
                            onClick={() => {
                                getNearFields(mutData);
                            }}
                        />
                        <DefaultButton
                            iconProps={{ iconName: 'Trash' }}
                            text="Clear Painting"
                            onClick={clearPainting}
                        />
                    </Stack>
                </div>
            </div>
            <div className="card">
                <Stack horizontal tokens={{ childrenGap: 10 }}>
                    <DefaultButton
                        text="Last"
                        iconProps={{ iconName: 'Back' }}
                        onClick={() => {
                            setNearIndex((v) => (v - 1 + nearFields.length) % nearFields.length);
                        }}
                    />
                    <DefaultButton
                        text="Next"
                        iconProps={{ iconName: 'Forward' }}
                        onClick={() => {
                            setNearIndex((v) => (v + 1) % nearFields.length);
                        }}
                    />
                </Stack>
                {nearSpec && <ReactVega spec={nearSpec} dataSource={cleanedData} />}
            </div>
        </Cont>
    );
};

export default observer(Painter);
