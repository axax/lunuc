import * as React from 'react'
import ImageList from '@mui/material/ImageList'
import ImageListItem from '@mui/material/ImageListItem'
import ImageListItemBar from '@mui/material/ImageListItemBar'
import { styled } from '@mui/material/styles'

const ResponsiveImageList = styled(ImageList)(({ theme }) => ({
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr)) !important',
    [theme.breakpoints.down('sm')]: {
        gridTemplateColumns: '1fr !important',
    },
    [theme.breakpoints.between('sm', 'md')]: {
        gridTemplateColumns: 'repeat(2, 1fr) !important',
    },
    [theme.breakpoints.up('md')]: {
        gridTemplateColumns: 'repeat(5, 1fr) !important',
    },
}));

export default function SimpleImageList({items}) {
    return (
        <ResponsiveImageList gap={20}>
            {items.map((item) => (
                <ImageListItem key={item.img} onClick={()=>{
                    if(item.href) {
                        location.href = item.href
                    }
                }}>
                    <img
                        src={`${item.img}?w=248&fit=crop&auto=format`}
                        alt={item.title}
                        loading="lazy"
                    />
                    <ImageListItemBar
                        sx={{
                            '& .MuiImageListItemBar-title': {
                                whiteSpace: 'pre-wrap'
                            },
                        }}
                        title={item.title}
                        subtitle={<span>by: {item.author}</span>}
                        position="below"
                    />
                </ImageListItem>
            ))}
        </ResponsiveImageList>
    );
}